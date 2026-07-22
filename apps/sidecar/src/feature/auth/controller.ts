/**
 * AuthController — `POST /v1/auth/token`.
 *
 * Exchanges an API key for a short-lived JWT. This route is public —
 * the AuthMiddleware deliberately bypasses /v1/auth/* (see AuthModule).
 */
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodValidationPipe } from 'nestjs-zod'
import { HttpException } from '@nestjs/common'
import { verifyApiKey, getSigningSecret } from '../../auth/keys.js'
import { signJwt } from '../../auth/jwt.js'
import { ErrorCode } from '../../infrastructure/errors/index.js'
import { TokenRequestDto, TokenResponseDto } from './dto/index.js'

export const JWT_EXPIRY_SECONDS = 15 * 60

@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  @Post('token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'exchangeToken' })
  @ApiOkResponse({ type: TokenResponseDto })
  exchange(
    @Body(new ZodValidationPipe(TokenRequestDto.schema))
    body: TokenRequestDto,
  ): TokenResponseDto {
    const kid = verifyApiKey(body.apiKey)
    if (!kid) {
      throw new HttpException(
        { error: { code: ErrorCode.UNAUTHENTICATED, message: 'Invalid API key' } },
        HttpStatus.UNAUTHORIZED,
      )
    }

    const secret = getSigningSecret(kid)
    if (!secret) {
      throw new HttpException(
        { error: { code: ErrorCode.INTERNAL, message: 'Signing key not found' } },
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }

    const token = signJwt({ sub: kid }, secret, JWT_EXPIRY_SECONDS)
    return {
      token,
      expiresIn: JWT_EXPIRY_SECONDS,
      tokenType: 'Bearer' as const,
    }
  }
}