const sgMail = require('@sendgrid/mail');

// Initialize SendGrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@yourdomain.com';
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Truth or Dare Game';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
  console.log('✅ SendGrid initialized');
} else {
  console.warn('⚠️  SendGrid API key not configured. Email features will be disabled.');
}

/**
 * Send email using SendGrid
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Plain text content (optional)
 */
async function sendEmail({ to, subject, html, text }) {
  if (!SENDGRID_API_KEY) {
    console.warn('⚠️  Cannot send email: SendGrid not configured');
    console.log(`Would send email to ${to}: ${subject}`);
    return { success: false, error: 'SendGrid not configured' };
  }

  try {
    const msg = {
      to,
      from: {
        email: EMAIL_FROM,
        name: EMAIL_FROM_NAME,
      },
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML if no text provided
    };

    await sgMail.send(msg);
    console.log(`✅ Email sent to ${to}: ${subject}`);
    return { success: true };
  } catch (error) {
    console.error('❌ SendGrid error:', error);
    if (error.response) {
      console.error('Error details:', error.response.body);
    }
    return { success: false, error: error.message };
  }
}

/**
 * Send email verification email
 * @param {Object} user - User object
 * @param {string} user.email - User email
 * @param {string} user.username - Username
 * @param {string} token - Verification token
 */
async function sendVerificationEmail(user, token) {
  const verificationUrl = `${BASE_URL}/verify-email?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; padding: 15px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎮 Welcome to Truth or Dare!</h1>
        </div>
        <div class="content">
          <h2>Hi ${user.username}!</h2>
          <p>Thank you for signing up. We're excited to have you join the game!</p>
          <p>To complete your registration and start playing, please verify your email address by clicking the button below:</p>
          <div style="text-align: center;">
            <a href="${verificationUrl}" class="button">Verify Email Address</a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="background: #fff; padding: 10px; border-radius: 5px; word-break: break-all;">${verificationUrl}</p>
          <p><strong>This link will expire in 24 hours.</strong></p>
          <p>If you didn't create an account, you can safely ignore this email.</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Truth or Dare Game. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: user.email,
    subject: 'Verify your email address',
    html,
  });
}

/**
 * Send password reset email
 * @param {Object} user - User object
 * @param {string} user.email - User email
 * @param {string} user.username - Username
 * @param {string} token - Reset token
 */
async function sendPasswordResetEmail(user, token) {
  const resetUrl = `${BASE_URL}/reset-password?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; padding: 15px 30px; background: #f5576c; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔐 Password Reset Request</h1>
        </div>
        <div class="content">
          <h2>Hi ${user.username},</h2>
          <p>We received a request to reset your password for your Truth or Dare account.</p>
          <p>Click the button below to create a new password:</p>
          <div style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Password</a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="background: #fff; padding: 10px; border-radius: 5px; word-break: break-all;">${resetUrl}</p>
          <p><strong>This link will expire in 1 hour.</strong></p>
          <div class="warning">
            <strong>⚠️ Security Notice:</strong> If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
          </div>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Truth or Dare Game. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: user.email,
    subject: 'Reset your password',
    html,
  });
}

/**
 * Send game invitation email
 * @param {Object} options - Invitation options
 * @param {string} options.to - Recipient email
 * @param {string} options.inviterName - Name of user sending invitation
 * @param {string} options.roomCode - Game room code
 */
async function sendGameInvitationEmail({ to, inviterName, roomCode }) {
  const gameUrl = `${BASE_URL}/?room=${roomCode}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; padding: 15px 30px; background: #4facfe; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .room-code { background: #fff; padding: 20px; border-radius: 5px; text-align: center; font-size: 24px; font-weight: bold; color: #4facfe; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎮 You're Invited to Play!</h1>
        </div>
        <div class="content">
          <h2>Game Invitation</h2>
          <p><strong>${inviterName}</strong> has invited you to play Truth or Dare!</p>
          <p>Join the fun and see who dares to take on the challenge!</p>
          <div class="room-code">
            Room Code: ${roomCode}
          </div>
          <div style="text-align: center;">
            <a href="${gameUrl}" class="button">Join Game Now</a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="background: #fff; padding: 10px; border-radius: 5px; word-break: break-all;">${gameUrl}</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Truth or Dare Game. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `${inviterName} invited you to play Truth or Dare!`,
    html,
  });
}

/**
 * Send notification email
 * @param {Object} options - Notification options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification message
 * @param {string} options.actionUrl - Optional action URL
 * @param {string} options.actionText - Optional action button text
 */
async function sendNotificationEmail({ to, subject, title, message, actionUrl, actionText }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%); color: #333; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; padding: 15px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${title}</h1>
        </div>
        <div class="content">
          <p>${message}</p>
          ${actionUrl ? `
            <div style="text-align: center;">
              <a href="${actionUrl}" class="button">${actionText || 'Take Action'}</a>
            </div>
          ` : ''}
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Truth or Dare Game. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject,
    html,
  });
}

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendGameInvitationEmail,
  sendNotificationEmail,
};
