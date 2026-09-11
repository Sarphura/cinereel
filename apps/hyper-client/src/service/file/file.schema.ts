import z from "zod"
import { DRIVE_KEY_PATTERN } from "../protocol"
import { isDriveDirectoryPath, isDriveFilePath } from "../file.service"

const driveKeySchema = z.string().regex(DRIVE_KEY_PATTERN, 'driveKey 必须是 64 位十六进制字符串。')
const filePathSchema = z.string().refine(isDriveFilePath, 'path 必须是规范的 Drive 绝对文件路径。')
const directoryPathSchema = z.string().refine(isDriveDirectoryPath, 'path 必须是规范的 Drive 绝对目录路径。')