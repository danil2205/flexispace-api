import {
  Controller,
  FileTypeValidator,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { S3Service } from './s3/s3.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

@Controller('files')
export class FilesController {
  constructor(private readonly s3Service: S3Service) {}

  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Upload image file to S3' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Image file (png/jpeg/jpg), max 5MB',
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'File uploaded successfully',
    schema: {
      example: {
        imageUrl: 'https://your-bucket.s3.amazonaws.com/uploads/example.jpg',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Validation failed (invalid type or file too large)',
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 5 }),
          new FileTypeValidator({ fileType: '.(png|jpeg|jpg)' }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const fileUrl = await this.s3Service.uploadFile(file);
    return { imageUrl: fileUrl };
  }
}
