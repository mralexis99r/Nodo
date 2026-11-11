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

export function createVerificationMailer(
  env = process.env,
  { fetch: sendRequest = globalThis.fetch } = {},
) {
  if (env.MAIL_PROVIDER === 'brevo' || (!env.MAIL_PROVIDER && env.BREVO_API_KEY)) {
    const senderEmail = env.MAIL_FROM_EMAIL || env.MAIL_FROM;
    const validSender = Boolean(
      senderEmail && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(senderEmail),
    );
    const isConfigured = Boolean(env.BREVO_API_KEY && validSender);
    return {
      isConfigured,
      async send({ email, code, language }) {
        if (!isConfigured) throw new Error('MAIL_NOT_CONFIGURED');
        const message = verificationMessage({ code, language });
        let response;
        try {
          response = await sendRequest('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'api-key': env.BREVO_API_KEY,
            },
            body: JSON.stringify({
              sender: { email: senderEmail, name: env.MAIL_FROM_NAME || 'Nodo' },
              to: [{ email }],
              subject: message.subject,
              textContent: message.text,
            }),
            signal: AbortSignal.timeout(15000),
            redirect: 'error',
          });
        } catch {
          throw new Error('MAIL_DELIVERY_FAILED');
        }
        if (!response.ok) throw new Error('MAIL_DELIVERY_FAILED');
        const result = await response.json().catch(() => null);
        if (!result?.messageId) throw new Error('MAIL_DELIVERY_FAILED');
      },
    };
  }
  if (env.MAIL_PROVIDER && env.MAIL_PROVIDER !== 'smtp')
    return {
      isConfigured: false,
      async send() {
        throw new Error('MAIL_NOT_CONFIGURED');
      },
    };
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
