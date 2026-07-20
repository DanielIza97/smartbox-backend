import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { SignupGymDto } from './dto/signup-gym.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // 1. LOGIN
  @ApiOperation({ summary: 'Iniciar sesión con email y contraseña' })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.email, loginDto.password);
  }

  // 1b. LISTADO PÚBLICO DE GIMNASIOS (para el selector de /register)
  @ApiOperation({
    summary:
      'Listado público de gimnasios (id/nombre) para elegir al registrarse',
  })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('gyms')
  async listGyms() {
    return this.authService.listGymsForSignup();
  }

  // 2. REGISTRO PÚBLICO (Cualquier usuario final se registra solo)
  @ApiOperation({ summary: 'Registro público (rol CLIENT por defecto)' })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  // 2b. ONBOARDING SELF-SERVE DE GIMNASIOS (E6-05, público) — crea el Gym y
  // su cuenta ADMIN dueña en un solo paso, sin pasar por SUPER_ADMIN.
  @ApiOperation({
    summary: 'Alta self-serve de un gimnasio nuevo + su cuenta ADMIN (E6-05)',
  })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @Post('signup-gym')
  async signupGym(@Body() signupGymDto: SignupGymDto) {
    return this.authService.signupGym(signupGymDto);
  }

  // 3. REGISTRO INTERNO (Solo SUPER_ADMIN crea Admins o Staff)
  @ApiOperation({
    summary: 'Crear un usuario administrativo (ADMIN, STAFF, ...)',
  })
  @ApiBearerAuth()
  @Post('register-internal')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  async registerInternal(@Body() registerDto: RegisterDto) {
    return this.authService.registerInternal(registerDto);
  }

  // 4. SOLICITAR ENLACE DE RECUPERACIÓN (Olvido de contraseña)
  @ApiOperation({ summary: 'Solicitar enlace de recuperación de contraseña' })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK) // Cambia el código por defecto (201) a 200 OK
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

  // 5. RESTABLECER LA CONTRASEÑA USANDO EL TOKEN DE LA URL
  @ApiOperation({
    summary: 'Restablecer contraseña con el token recibido por correo',
  })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(
      resetPasswordDto.token,
      resetPasswordDto.newPassword,
    );
  }

  // 6. CONFIRMAR CAMBIO DE CORREO (enlace enviado por email)
  @ApiOperation({
    summary: 'Confirmar un cambio de correo con el token recibido',
  })
  @Get('verify-email-change')
  @HttpCode(HttpStatus.OK)
  async verifyEmailChange(@Query('token') token: string) {
    return this.authService.verifyEmailChange(token);
  }
}
