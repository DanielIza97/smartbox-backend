import { Controller, Post, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // 1. LOGIN (Tu ruta original intacta)
  @Post('login')
  login(
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    return this.authService.login(email, password);
  }

  // 2. REGISTRO PÚBLICO (Cualquier usuario final se registra solo)
  @Post('register')
  async register(@Body() registerDto: RegisterDto) { // 🔄 Tipado correctamente con tu DTO limpio
    return this.authService.register(registerDto);
  }

  // 3. REGISTRO INTERNO (Para que tu SuperAdmin cree Admins o Staff desde el modal)
  @Post('register-internal')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles('SUPER_ADMIN')
  async registerInternal(@Body() registerDto: RegisterDto) {
    return this.authService.registerInternal(registerDto);
  }

  // 4. SOLICITAR ENLACE DE RECUPERACIÓN (Olvido de contraseña)
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK) // Cambia el código por defecto (201) a 200 OK
  async forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  // 5. RESTABLECER LA CONTRASEÑA USANDO EL TOKEN DE LA URL
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Query('token') token: string,
    @Body('password') passwordBody: any,
  ) {
    // Le pasamos el token que viene de la URL (?token=...) 
    // y el body completo al servicio
    return this.authService.resetPassword(token, passwordBody);
  }
}