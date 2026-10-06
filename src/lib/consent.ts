/**
 * Consentimiento explícito y versionado al unirse a un equipo (PS-02, ARQUITECTURA §9).
 * Cambiar cualquier punto exige subir la versión: queda guardada en team_members.consent_version.
 */
export const CONSENT_VERSION = '2026-10-v1';

export const CONSENT_POINTS: { title: string; text: string }[] = [
  {
    title: 'Qué se mide',
    text: 'La app que tienes en primer plano, su categoría (productivo, neutro, distracción o IA), tus tiempos de actividad, inactividad, descansos y pausas, tu tiempo registrado y los cierres de Pulso dentro de la jornada.',
  },
  {
    title: 'Qué nunca se mide',
    text: 'Teclas, capturas de pantalla, el contenido de documentos ni de tus chats con IA. Los títulos de ventana se quedan cifrados en tu equipo y nunca se envían.',
  },
  {
    title: 'Quién lo ve',
    text: 'Owner y admin ven tus totales por categoría, app y uso de IA, y tus cierres de Pulso. Un observador solo ve totales del equipo sin nombres. El detalle con títulos solo lo ves tú.',
  },
  {
    title: 'IA y lugar de los datos',
    text: 'Los reportes con IA usan cifras calculadas, con seudónimos en lugar de nombres. En el modo gratis el proveedor es DeepSeek; el equipo puede usar otro. Los datos pueden procesarse fuera de Colombia.',
  },
  {
    title: 'Para qué sirve',
    text: 'Los reportes son indicativos: las mediciones automáticas tienen errores y no son una prueba disciplinaria.',
  },
  {
    title: 'Tu control',
    text: 'Puedes pausar el seguimiento, ocultar apps y salir del equipo cuando quieras. Al salir se borra tu actividad en ese equipo; tu tiempo registrado se conserva como «Exmiembro».',
  },
];
