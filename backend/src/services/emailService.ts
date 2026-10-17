import nodemailer from 'nodemailer';

interface SendVerificationEmailOptions {
  email: string;
  code: string;
  title?: string;
  description?: string;
}

export interface SendEmailResult {
  success: boolean;
  devMode?: boolean;
  error?: string;
}

export async function sendVerificationEmail({ email, code, title, description }: SendVerificationEmailOptions): Promise<SendEmailResult> {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'EGE.SYSTEM <noreply@ege.system>';

  const emailTitle = title || 'ПОДТВЕРЖДЕНИЕ РЕГИСТРАЦИИ';
  const emailDesc = description || 'Вы получили это письмо для завершения регистрации на платформе <strong style="color: #ffffff;">EGE.SYSTEM</strong>. Введите следующий 6-значный код:';

  // Если SMTP не задан — режим разработки: логируем в терминал
  if (!host || !user || !pass) {
    console.log(`📨 [DEV EMAIL] Код для ${email} (${emailTitle}): [ ${code} ]`);
    return { success: true, devMode: true };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });

    const htmlContent = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailTitle} // EGE.SYSTEM</title>
</head>
<body style="margin: 0; padding: 0; background-color: #050507; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #050507; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 520px; background-color: #09090b; border: 1px solid rgba(255, 255, 255, 0.12); padding: 0;" cellspacing="0" cellpadding="0">
          <!-- Верхний акцент-бордер -->
          <tr>
            <td height="3" style="background-color: #d4ff00;"></td>
          </tr>
          
          <!-- Шапка HUD -->
          <tr>
            <td style="padding: 28px 32px 20px 32px; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="display: inline-block; background-color: #d4ff00; color: #000000; font-family: monospace; font-weight: 900; font-size: 14px; padding: 4px 8px; margin-right: 8px;">EGE.SYSTEM</div>
                  </td>
                  <td align="right">
                    <span style="font-family: monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: #71717a;">[ ACCESS // VERIFY ]</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Контент -->
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #ffffff;">
                ${emailTitle}
              </h1>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #a1a1aa;">
                ${emailDesc}
              </p>

              <!-- Блок кода EGE.SYSTEM HUD -->
              <div style="margin: 28px 0; background-color: #0c0c0f; border: 1px solid #d4ff00; padding: 24px 12px; text-align: center;">
                <div style="font-family: 'SFMono-Regular', Consolas, 'Courier New', monospace; font-size: 36px; font-weight: 800; letter-spacing: 0.35em; color: #d4ff00; padding-left: 0.35em;">
                  ${code}
                </div>
              </div>

              <!-- Предупреждение о времени -->
              <div style="background-color: rgba(212, 255, 0, 0.04); border-left: 3px solid #d4ff00; padding: 12px 16px; margin: 24px 0;">
                <p style="margin: 0; font-size: 13px; color: #d4d4d8; font-family: monospace;">
                  ⏱ <strong>Срок действия:</strong> код активен в течение <strong>10 минут</strong>.
                </p>
              </div>

              <p style="margin: 20px 0 0 0; font-size: 12px; line-height: 1.5; color: #71717a;">
                Если вы не отправляли запрос на регистрацию в EGE.SYSTEM, просто проигнорируйте это сообщение. Безопасность вашей учетной записи гарантирована.
              </p>
            </td>
          </tr>

          <!-- Футер HUD -->
          <tr>
            <td style="padding: 20px 32px; background-color: #060608; border-top: 1px solid rgba(255, 255, 255, 0.08); text-align: center;">
              <p style="margin: 0; font-family: monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: #52525b;">
                EGE.SYSTEM © 2027 // AUTOMATED NOTIFICATION PROTOCOL
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    await transporter.sendMail({
      from,
      to: email,
      subject: `EGE.SYSTEM // Код подтверждения регистрации: ${code}`,
      html: htmlContent,
    });
    return { success: true };
  } catch (error: any) {
    console.error('Ошибка отправки email через SMTP:', error);
    // В случае сбоя SMTP в dev/test среде логируем код для надежности
    console.log(`📨 [DEV EMAIL FALLBACK] Код для ${email}: [ ${code} ]`);
    return {
      success: false,
      error: error?.message || 'Ошибка аутентификации SMTP',
    };
  }
}
