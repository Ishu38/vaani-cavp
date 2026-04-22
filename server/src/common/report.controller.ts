import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { unlinkSync } from 'fs';
import { Response } from 'express';
import { RolesGuard } from '../auth/roles.guard';

const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), '..', 'uploads');

const audioStorage = diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `report_${uniqueSuffix}${extname(file.originalname)}`);
  },
});

@ApiTags('Report')
@Controller('api')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class ReportController {
  private readonly engineUrl: string;
  private readonly engineApiKey: string;

  constructor(private config: ConfigService) {
    this.engineUrl = this.config.get('FASTAPI_URL', 'http://localhost:8000');
    this.engineApiKey = this.config.get('ENGINE_API_KEY', '');
  }

  @Post('report')
  @ApiOperation({ summary: 'Generate a PDF diagnostic report (proxied to engine)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: audioStorage,
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
        const { extname: ext } = require('path');
        const allowed = ['.wav', '.mp3', '.ogg', '.webm', '.flac', '.m4a'];
        if (allowed.includes(ext(file.originalname).toLowerCase())) {
          cb(null, true);
        } else {
          cb(new Error('Unsupported audio format'), false);
        }
      },
    }),
  )
  async generateReport(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { gender?: string; student_name?: string; student_id?: string },
    @Res() res: Response,
  ) {
    if (!file) throw new BadRequestException('Audio file is required');

    const formData = new FormData();

    const fs = await import('fs');
    const fileBuffer = fs.readFileSync(file.path);
    formData.append('audio', new Blob([fileBuffer]), file.originalname);
    formData.append('gender', body.gender || 'child');
    formData.append('student_name', body.student_name || 'Student');
    formData.append('student_id', body.student_id || '');

    try {
      const engineRes = await fetch(`${this.engineUrl}/api/report`, {
        method: 'POST',
        body: formData,
        headers: this.engineApiKey ? { 'X-Engine-API-Key': this.engineApiKey } : {},
      });

      if (!engineRes.ok) {
        res.status(engineRes.status).json({ error: 'Report generation failed' });
        return;
      }

      const pdfBuffer = Buffer.from(await engineRes.arrayBuffer());

      const contentDisp = engineRes.headers.get('content-disposition') || '';
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisp || 'attachment; filename="voice_report.pdf"',
        'Content-Length': pdfBuffer.length.toString(),
      });
      res.send(pdfBuffer);
    } finally {
      // Clean up temp file
      try {
        unlinkSync(file.path);
      } catch {}
    }
  }
}
