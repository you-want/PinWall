export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'pinwall',
    password: process.env.DB_PASSWORD || 'pinwall',
    database: process.env.DB_NAME || 'pinwall_marketplace',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'pinwall-jwt-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  storage: {
    type: process.env.STORAGE_TYPE || 'local', // 'local' | 's3'
    localPath: process.env.STORAGE_LOCAL_PATH || './uploads',
    s3: {
      bucket: process.env.S3_BUCKET || '',
      region: process.env.S3_REGION || '',
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    },
  },
});
