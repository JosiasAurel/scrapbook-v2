import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

// export async function uploadAttachment(stream: ReadableStream, filetype: string): Promise<string | undefined> {
export async function uploadAttachment(arrayBuffer: ArrayBuffer, filetype: string): Promise<string | undefined> {
    const bodyData = Buffer.from(arrayBuffer);
    const upload = new Upload({
        client: s3, 
        params: {
            Bucket: "scrapbook-into-the-redwoods",
            Key: `${uuidv4()}.${filetype.split("/")[1]}`,
            Body: bodyData
        }
    });
    try {
        const uploadedImage = await upload.done();
        return uploadedImage.Location
    } catch (err) {
        console.log("Failed to upload blob", typeof stream, Object.keys(stream).length, stream, err);
        return undefined;
    }
}

export async function makeSignedUrl(filename: string, filetype: string) {
    const command = new PutObjectCommand({
        Bucket: "scrapbook-into-the-redwoods",
        Key: `${uuidv4()}-${filename}`,
        ContentType: filetype
    });

    // signed url expires in 15 minutes
    const signedUrl = await getSignedUrl(s3, command, { expires: 15 * 60 });
    return signedUrl;
}

export default s3;
