import { Resend } from "resend";
import { config } from "dotenv";

// load environment variables
config();

const resend = new Resend(process.env.AUTH_RESEND_KEY);

type EmailParams = {
    subject: string,
    to: string,
    htmlBody: string
}
export async function sendEmail({ subject, to, htmlBody }: EmailParams) {
    const { data, error } = await resend.emails.send({
        from: "josias <scrapbook@auth.josiasw.dev>",
        to: [to],
        subject,
        html: `<div>${htmlBody}</div>`
    });
    if (error) {
        throw Error("Failed to send email: " + JSON.stringify(error));
    }
    return data;
}