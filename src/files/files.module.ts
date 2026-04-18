import { Module } from '@nestjs/common';
import { S3Service } from './s3/s3.service';
import { FilesController } from './files.controller';
import { ConfigModule } from '@nestjs/config';
import awsConfig from '../config/aws.config';

@Module({
  imports: [ConfigModule.forFeature(awsConfig)],
  providers: [S3Service],
  controllers: [FilesController],
})
export class FilesModule {}
