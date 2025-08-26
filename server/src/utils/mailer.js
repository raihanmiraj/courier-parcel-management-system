import nodemailer from 'nodemailer';

// Defaults to Gmail SMTP for local testing; can be overridden by env vars
const SMTP_HOST = process.env.MAIL_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.MAIL_PORT || 465);
const SMTP_USER = process.env.MAIL_USER ;
const SMTP_PASS = process.env.MAIL_PASS ;
const SMTP_SECURE = process.env.MAIL_SECURE ? process.env.MAIL_SECURE === 'true' : SMTP_PORT === 465;
const SMTP_FROM = process.env.MAIL_FROM || SMTP_USER;
const SMTP_FROM_NAME = process.env.MAIL_FROM_NAME || 'Courier Parcel';

export const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

export async function sendStatusEmail({ to, parcel, newStatus }) {
  if (!to) return;
  const subject = `Your parcel ${parcel.trackingCode} is now ${newStatus}`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.6;">
      <h2>Parcel Status Updated</h2>
      <p>Hello${parcel?.customer?.name ? ` ${parcel.customer.name}` : ''},</p>
      <p>Your parcel with Tracking Code <strong>${parcel.trackingCode}</strong> has been updated to status: <strong>${newStatus}</strong>.</p>
      <ul>
        <li>Pickup: ${parcel.pickupAddress}</li>
        <li>Delivery: ${parcel.deliveryAddress}</li>
      </ul>
      <p>You can view details in your dashboard.</p>
      <hr />
      <p style="color:#64748b; font-size:12px;">This is an automated message from Courier Manager.</p>
    </div>
  `;
  const text = `Parcel ${parcel.trackingCode} status changed to ${newStatus}`;
  await transporter.sendMail({
    from: `${SMTP_FROM_NAME} <${SMTP_FROM}>`,
    to,
    subject,
    text,
    html,
  });
}


