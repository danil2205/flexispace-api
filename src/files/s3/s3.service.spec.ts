import { Test, TestingModule } from '@nestjs/testing';
import { S3Service } from './s3.service';
import { ConfigType } from '@nestjs/config';
import awsConfig from '../../config/aws.config';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { InternalServerErrorException } from '@nestjs/common';
import { UPLOAD_ERROR } from '../files.constants';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    PutObjectCommand: jest.fn(),
  };
});

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

describe('S3Service', () => {
  let service: S3Service;
  let mockAwsConfig: ConfigType<typeof awsConfig>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockAwsConfig = {
      region: 'test_region',
      s3BucketName: 'test_bucket',
      endpoint: 'test_endpoint',
      accessKeyId: 'test_key',
      secretAccessKey: 'test_secret',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3Service,
        { provide: awsConfig.KEY, useValue: mockAwsConfig },
      ],
    }).compile();

    service = module.get<S3Service>(S3Service);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadFile', () => {
    const file = {
      buffer: Buffer.from('test'),
      originalname: 'test.png',
      mimetype: 'image/png',
    } as Express.Multer.File;

    it('should upload file to S3 and return the URL', async () => {
      const key = 'test-folder/mock-uuid-test.png';
      mockSend.mockResolvedValue({});

      const result = await service.uploadFile(file, 'test-folder');

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Body: file.buffer,
          Bucket: mockAwsConfig.s3BucketName,
          Key: key,
          ContentType: file.mimetype,
        }),
      );

      expect(result).toBe(
        `${mockAwsConfig.endpoint}/${mockAwsConfig.s3BucketName}/${key}`,
      );
    });

    it('should use default folder "workspaces" if none is provided', async () => {
      mockSend.mockResolvedValue({});

      await service.uploadFile(file);

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: 'workspaces/mock-uuid-test.png',
        }),
      );
    });

    it('should throw an error if S3 upload fails', async () => {
      const error = new Error('S3 error');
      mockSend.mockRejectedValue(error);

      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(service.uploadFile(file)).rejects.toThrow(
        new InternalServerErrorException(UPLOAD_ERROR),
      );

      expect(consoleSpy).toHaveBeenCalledWith('S3 Upload Error:', error);

      consoleSpy.mockRestore();
    });
  });
});
