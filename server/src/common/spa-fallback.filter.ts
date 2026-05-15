import { ArgumentsHost, Catch, ExceptionFilter, NotFoundException } from '@nestjs/common';
import { Request, Response } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';

const INDEX_HTML = join(__dirname, '..', '..', '..', 'client', 'dist', 'index.html');

@Catch(NotFoundException)
export class SpaFallbackFilter implements ExceptionFilter {
  catch(exception: NotFoundException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const isGet = req.method === 'GET';
    const isApi = req.path.startsWith('/api');
    const looksLikeAsset = /\.[a-zA-Z0-9]+$/.test(req.path);

    if (isGet && !isApi && !looksLikeAsset && existsSync(INDEX_HTML)) {
      return res.sendFile(INDEX_HTML);
    }

    res.status(404).json({
      statusCode: 404,
      message: exception.message,
      error: 'Not Found',
    });
  }
}
