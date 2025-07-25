import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { config } from "dotenv";
import { v4 as uuidv4 } from "uuid";

// load environment variables
config();

const s3 = new S3Client({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!
  }
});

export async function uploadAttachment(blob: Blob, filename: string): Promise<string | undefined> {
    const upload = new Upload({
        client: s3, 
        params: {
            Bucket: "scrapbook-into-the-redwoods",
            Key: `${uuidv4()}-${filename}`,
            Body: blob
        }
    });
    const uploadedImage = await upload.done();
    return uploadedImage.Location;
}

export default s3;