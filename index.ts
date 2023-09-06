import { BlobSASPermissions, BlobServiceClient } from "@azure/storage-blob";
import { unlink } from "node:fs/promises";

const connectionString = Bun.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = Bun.env.AZURE_STORAGE_CONTAINER_NAME;
if (!connectionString) throw new Error("AZURE_STORAGE_CONNECTION_STRING is required");
if (!containerName) throw new Error("AZURE_STORAGE_CONTAINER_NAME is required");
const dbArchive = "db.archive";

const execute = async (command: string) => {
  const exitCode = await Bun.spawn(command.split(" ")).exited;
  if (exitCode != 0) throw new Error(`Command ${command} failed`);
};

const backup = async () => {
  const mongodbUrl = Bun.env.MONGODB_URL;
  if (!mongodbUrl) throw new Error("MONGODB_URL is required");
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);
  await execute(`mongodump --gzip --archive=${dbArchive} ${mongodbUrl}`);
  const archive = await Bun.file(dbArchive).arrayBuffer();
  const blobName = `db-backup-${new Date().toISOString()}.archive`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.upload(archive, archive.byteLength);
  await unlink(dbArchive);
};

const list = async () => {
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);
  for await (const blob of containerClient.listBlobsFlat()) console.log(blob.name);
};

const restore = async () => {
  const mongodbUrl = Bun.env.MONGODB_URL;
  if (!mongodbUrl) throw new Error("MONGODB_URL is required");
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blobName = Bun.argv[3];
  if (!blobName) throw new Error("blobName is required as the second argument");
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  const url = await blockBlobClient.generateSasUrl({ permissions: BlobSASPermissions.from({ read: true }), expiresOn: new Date(Date.now() + 3000) });
  const response = await fetch(url);
  await Bun.write(dbArchive, response);
  await execute(`mongorestore --gzip --drop --archive=${dbArchive} ${mongodbUrl}`);
  await unlink(dbArchive);
};

const create = async () => {
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);
  if (await containerClient.exists()) throw new Error(`Container ${containerName} already exists`);
  else await containerClient.create();
};

const command = Bun.argv[2] ?? "list";
switch (command) {
  case "backup":
    await backup();
    break;
  case "list":
    await list();
    break;
  case "restore":
    await restore();
    break;
  case "create":
    await create();
    break;
  default:
    throw new Error(`Unknown command ${command}`);
}
