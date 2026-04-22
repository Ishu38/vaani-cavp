# MongoDB Atlas Migration Guide

## Prerequisites
- MongoDB Atlas account (free tier works for development)
- `mongodump` and `mongorestore` installed locally

## Step 1: Create Atlas Cluster
1. Go to https://cloud.mongodb.com
2. Create a new project: "Vani Production"
3. Build a cluster:
   - Shared (free) for dev/pilot, Dedicated (M10+) for production
   - Region: Mumbai (ap-south-1) for lowest latency to Indian schools
   - Cluster name: vani-prod

## Step 2: Configure Security
1. Database Access -> Add Database User:
   - Username: vani_app
   - Auth: Password (generate a strong one)
   - Role: readWrite on `contrastive_voice` database
2. Network Access -> Add IP:
   - For Cloud Run: Add 0.0.0.0/0 (Cloud Run IPs are dynamic) -- restrict via VPC peering in production
   - For GCE: Add the static IP of your engine VM

## Step 3: Get Connection String
1. Clusters -> Connect -> Connect your application
2. Copy the connection string:
   ```
   mongodb+srv://vani_app:<password>@vani-prod.xxxxx.mongodb.net/contrastive_voice?retryWrites=true&w=majority
   ```

## Step 4: Migrate Existing Data
```bash
# Export from local MongoDB
mongodump --uri="mongodb://localhost:27017/contrastive_voice" --out=./backup

# Import to Atlas
mongorestore --uri="mongodb+srv://vani_app:<password>@vani-prod.xxxxx.mongodb.net" --db=contrastive_voice ./backup/contrastive_voice
```

## Step 5: Update Environment Variables
Update `.env`:
```bash
MONGO_URI=mongodb+srv://vani_app:<password>@vani-prod.xxxxx.mongodb.net/contrastive_voice?retryWrites=true&w=majority
```

Update `docker-compose.prod.yml` server environment:
- Remove the local mongo service dependency (or keep for dev)
- Set MONGO_URI to the Atlas connection string

## Step 6: Enable Atlas Features
1. **Encryption at Rest**: Enabled by default on all Atlas clusters (AES-256)
2. **Automated Backups**:
   - Free tier: No automated backups (use manual snapshots)
   - M10+: Continuous backups with point-in-time recovery
   - Configure: Clusters -> ... -> Backup -> Enable
3. **Monitoring**:
   - Atlas provides built-in performance metrics
   - Set up alerts: Clusters -> ... -> Alerts
   - Recommended: Alert on connections > 80%, disk usage > 80%

## Step 7: Create Indexes (run once)
The NestJS Mongoose schemas auto-create indexes, but verify in Atlas:
```javascript
// In Atlas Data Explorer -> contrastive_voice -> voiceprofiles -> Indexes
// Should see:
// { speakerId: 1, createdAt: -1 }
// { teacherId: 1, createdAt: -1 }
// { schoolId: 1, createdAt: -1 }
```

## Pricing (as of 2026)
| Tier | RAM | Storage | Cost |
|------|-----|---------|------|
| M0 (Free) | 512MB | 512MB | Free forever |
| M2 | 2GB | 2GB | ~$9/mo |
| M10 | 2GB | 10GB | ~$57/mo |
| M20 | 4GB | 20GB | ~$140/mo |

For school pilots (< 1000 profiles): M0 or M2 is sufficient.
For production (10+ schools): M10 minimum for automated backups.
