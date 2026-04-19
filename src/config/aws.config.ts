import { registerAs } from '@nestjs/config';

export default registerAs('aws', () => ({
  region: process.env.AWS_REGION as string,
  s3BucketName: process.env.AWS_S3_BUCKET_NAME as string,
  endpoint: process.env.AWS_ENDPOINT as string,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
}));
