import { Controller, Post, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';

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

  // 2. REGISTRO DE NUEVOS ADMINISTRADORES / USUARIOS
  @Post('register')
  async register(@Body() signUpData: any) {
    return this.authService.register(signUpData);
  }

  // 3. SOLICITAR ENLACE DE RECUPERACIÓN (Olvido de contraseña)
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK) // Cambia el código por defecto (21) a 200 OK
  async forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  // 4. RESTABLECER LA CONTRASEÑA USANDO EL TOKEN DE LA URL
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