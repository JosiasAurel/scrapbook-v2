import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { db } from "./drizzle";
import { sendEmail } from "./email";
import { updates, users, sessions, accounts, verifications } from "./drizzle";

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: 'sqlite',
        usePlural: true,
        schema: {
            updates,
            users,
            sessions,
            accounts,
            verifications
        }
    }),
    // emailVerification: {
    //     sendOnSignUp: true,
    //     sendVerificationEmail: async ({ user, url, token }, request) => {
    //         await sendEmail({
    //             subject: "Verify your email address",
    //             to: user.email,
    //             htmlBody: `Click the link to verify your email: ${url}`
    //         })
    //     }
    // },

    plugins: [
        magicLink({
            sendMagicLink: async ({ email, token, url}, request) => {
                await sendEmail({
                    subject: "Log into scrapbookv2",
                    to: email,
                    htmlBody: `Click the link to log into scrapbookv2: ${url}`
                })
            }
        })
    ],
})

