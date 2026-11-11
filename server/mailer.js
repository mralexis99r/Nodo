import nodemailer from 'nodemailer';

export function verificationMessage({ code, language }) {
  const spanish = language === 'es';
  return {
    subject: spanish ? 'Confirma tu correo en Nodo' : 'Verify your email for Nodo',
    text: spanish
      ? `Tu código de verificación de Nodo es: ${code}\n\nExpira en 10 minutos y solo se puede usar una vez. Al solicitar otro, el anterior deja de funcionar.\n\nSi no solicitaste este código, ignora este correo.`
      : `Your Nodo verification code is: ${code}\n\nIt expires in 10 minutes and can only be used once. Requesting another code invalidates the previous one.\n\nIf you did not request this code, ignore this email.`,
  };
}

export function createVerificationMailer(env = process.env) {
  const port = Number(env.SMTP_PORT || 587);
  const isConfigured = Boolean(
    env.SMTP_HOST &&
    env.SMTP_USER &&
    env.SMTP_PASS &&
    env.MAIL_FROM &&
    Number.isInteger(port) &&
    port > 0 &&
    port <= 65535,
  );
  const transport = isConfigured
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port,
        secure: port === 465 || env.SMTP_SECURE === 'true',
        requireTLS: true,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
        disableFileAccess: true,
        disableUrlAccess: true,
        logger: false,
        debug: false,
      })
    : null;
  return {
    isConfigured,
    async send({ email, code, language }) {
      if (!transport) throw new Error('MAIL_NOT_CONFIGURED');
      const result = await transport.sendMail({
        from: env.MAIL_FROM,
        to: email,
        ...verificationMessage({ code, language }),
      });
      if (!result.accepted?.length) throw new Error('MAIL_DELIVERY_FAILED');
    },
  };
}
