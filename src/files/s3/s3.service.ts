import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigType } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { UPLOAD_ERROR } from '../files.constants';
import awsConfig from '../../config/aws.config';

@Injectable()
export class S3Service {
  private s3Client: S3Client;
  private readonly bucketName: string;
  private readonly region: string;
  private readonly endpoint: string;

  constructor(
    @Inject(awsConfig.KEY)
    private readonly awsConfiguration: ConfigType<typeof awsConfig>,
  ) {
    this.region = this.awsConfiguration.region!;
    this.bucketName = this.awsConfiguration.s3BucketName!;
    this.endpoint = this.awsConfiguration.endpoint!;
    this.s3Client = new S3Client({
      region: this.region,
      endpoint: this.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.awsConfiguration.accessKeyId!,
        secretAccessKey: this.awsConfiguration.secretAccessKey!,
      },
    });
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'workspaces',
  ): Promise<string> {
    const uniqueFileName = `${folder}/${uuidv4()}-${file.originalname.replace(/\s/g, '_')}`;
    const input = {
      Body: file.buffer,
      Bucket: this.bucketName,
      Key: uniqueFileName,
      ContentType: file.mimetype,
    };
    const command = new PutObjectCommand(input);

    try {
      await this.s3Client.send(command);
      return `${this.endpoint}/${this.bucketName}/${uniqueFileName}`;
    } catch (error) {
      console.error('S3 Upload Error:', error);
      throw new InternalServerErrorException(UPLOAD_ERROR);
    }
  }
}
