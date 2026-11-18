# Account email templates (Supabase)

Paste these into Supabase: **Authentication > Emails > Templates**. Each link goes to Pinard's own `/auth/confirm`, which works even when the email is opened on a different device from the one that asked (pre-launch review, 18 November 2026). Before they are used:

1. **Authentication > URL Configuration:** Site URL `https://pinardapp.com`; add `https://pinardapp.com/**` and `http://localhost:3000/**` to the redirect URLs.
2. **Authentication > Emails > SMTP Settings:** custom SMTP (Resend), sender `Pinard <support@pinardapp.com>`. Without it Supabase sends only a few emails an hour, to the team only.
3. **Authentication > Providers > Email:** confirm email on; minimum password length 8; leaked password protection on.

## Confirm signup

Subject: `Confirm your email for Pinard`

```html
<h2>Confirm your email</h2>
<p>Thank you for joining Pinard. Confirm this is your email address to start your plan:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding">Confirm my email</a></p>
<p>The link works once. If you did not sign up for Pinard, you can ignore this email.</p>
<p>Pinard is a revision aid for the MRCOG examinations, independent of the Royal College of Obstetricians and Gynaecologists.</p>
```

## Reset password

Subject: `Choose a new Pinard password`

```html
<h2>Choose a new password</h2>
<p>Someone asked to reset the password for your Pinard account. If it was you, choose a new one here:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Choose a new password</a></p>
<p>The link works once, for one hour. If you did not ask, ignore this email: your password stays as it is.</p>
```

## Change email address (only if email changes are used)

Subject: `Confirm your new email for Pinard`

```html
<h2>Confirm your new email address</h2>
<p>Confirm that you want Pinard to use this address from now on:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/account">Confirm my new email</a></p>
```
