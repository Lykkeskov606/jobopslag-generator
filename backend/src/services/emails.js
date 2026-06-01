const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@jobopslag-generator.dk';

async function sendPasswordResetEmail(to, resetLink) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[emails] RESEND_API_KEY not set — reset link:', resetLink);
    return;
  }
  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: 'Nulstil dit password — Jobopslags-generator',
    text: [
      'Hej,',
      '',
      'Vi har modtaget en anmodning om at nulstille passwordet til din konto på Jobopslags-generator.',
      '',
      'Klik på linket herunder for at sætte et nyt password:',
      resetLink,
      '',
      'Linket er gyldigt i 1 time og kan kun bruges én gang.',
      '',
      'Hvis du ikke har bedt om dette, kan du ignorere denne email — dit password forbliver uændret.',
      '',
      'Vh,',
      'Jobopslags-generator',
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;color:#1a1a1a;max-width:480px;margin:0 auto;padding:32px 16px">
  <h2 style="margin-top:0">Nulstil dit password</h2>
  <p>Vi har modtaget en anmodning om at nulstille passwordet til din konto på Jobopslags-generator.</p>
  <p style="margin:24px 0">
    <a href="${resetLink}"
       style="background:#1d4ed8;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600">
      Nulstil password
    </a>
  </p>
  <p style="font-size:13px;color:#555">
    Eller kopiér dette link ind i din browser:<br>
    <span style="word-break:break-all">${resetLink}</span>
  </p>
  <p style="font-size:13px;color:#555">
    Linket er gyldigt i 1 time og kan kun bruges én gang.<br>
    Hvis du ikke har bedt om dette, kan du ignorere denne email.
  </p>
</body>
</html>`,
  });
}

module.exports = { sendPasswordResetEmail };
