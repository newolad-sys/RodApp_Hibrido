/**
 * Traduce los errores de Supabase Auth a mensajes en espanol aptos para el
 * usuario final. Evita filtrar detalles tecnicos y mantiene un tono consistente
 * en login y registro.
 */
export function mensajeErrorAuth(error: unknown): string {
  const raw =
    (error as { message?: string })?.message?.toLowerCase() ??
    String(error ?? '').toLowerCase();

  if (raw.includes('cuenta_suspendida')) {
    return 'Tu cuenta esta suspendida. Contacta al administrador de RodApp.';
  }
  if (raw.includes('invalid login credentials')) {
    return 'Correo o contrasena incorrectos.';
  }
  if (raw.includes('email not confirmed')) {
    return 'Debes confirmar tu correo antes de iniciar sesion. Revisa tu bandeja de entrada.';
  }
  if (raw.includes('user already registered') || raw.includes('already been registered')) {
    return 'Ya existe una cuenta con este correo. Inicia sesion.';
  }
  if (raw.includes('password should be at least')) {
    return 'La contrasena es demasiado corta (minimo 6 caracteres).';
  }
  if (raw.includes('should be different from the old password')) {
    return 'La nueva contrasena debe ser distinta a la anterior.';
  }
  // Enlaces del correo (recuperar contrasena, confirmar cuenta) vencidos o ya usados.
  if (
    raw.includes('otp_expired') ||
    raw.includes('has expired') ||
    raw.includes('link is invalid') ||
    raw.includes('already been used')
  ) {
    return 'El enlace vencio o ya fue usado. Pide uno nuevo.';
  }
  // PKCE: el enlace solo se puede canjear en el navegador que lo solicito.
  if (raw.includes('code verifier') || raw.includes('flow_state') || raw.includes('flow state')) {
    return 'Abre el enlace en el mismo navegador donde lo pediste, o pide uno nuevo.';
  }
  if (raw.includes('auth session missing') || raw.includes('session_not_found')) {
    return 'Tu enlace de recuperacion vencio. Pide uno nuevo.';
  }
  if (raw.includes('weak') && raw.includes('password')) {
    return 'La contrasena es muy debil. Usa letras, numeros y al menos 6 caracteres.';
  }
  if (raw.includes('unable to validate email address') || raw.includes('invalid email')) {
    return 'El correo no tiene un formato valido.';
  }
  if (raw.includes('rate limit') || raw.includes('too many requests')) {
    return 'Demasiados intentos. Espera un momento e intenta de nuevo.';
  }
  if (
    (raw.includes('redirect') && (raw.includes('not allowed') || raw.includes('invalid') || raw.includes('mismatch'))) ||
    raw.includes('redirect uri') ||
    raw.includes('redirect_url') ||
    raw.includes('redirect url')
  ) {
    return 'La URL de redirección no coincide con la configuración de Supabase. Revisa Auth > URL Configuration.';
  }
  if (raw.includes('err_name_not_resolved') || raw.includes('name not resolved') || raw.includes('dns')) {
    return 'No se encuentra el servidor configurado. Verifica el Project URL de Supabase y tu DNS.';
  }
  if (raw.includes('network') || raw.includes('failed to fetch')) {
    return 'No se pudo conectar con Supabase. Verifica el Project URL y la clave anon del proyecto, además de tu conexión.';
  }
  if (raw.includes('popup') || raw.includes('cancelled') || raw.includes('canceled')) {
    return 'Inicio de sesion con Google cancelado.';
  }
  // Error sin traduccion: se registra el original para poder diagnosticarlo
  // (el usuario solo ve el mensaje generico).
  console.error('[mensajeErrorAuth] error sin traduccion:', error);
  return 'Ocurrio un error inesperado. Intenta nuevamente.';
}
