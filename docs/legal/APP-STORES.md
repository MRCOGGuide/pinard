# iOS and Android apps: store requirements

Phase 11, 9 October 2026. **Planned, not built.** What Apple and Google will require when the apps are made, so it can be designed in from the start. Check the current store rules at that time: they change every year.

## Both stores

| Requirement | What it means for Pinard | Ready now? |
|---|---|---|
| **Account deletion inside the app** | A candidate who can create an account in the app must be able to delete it from inside the app, not only by email. | The website has it (Account > Delete your account). The app needs the same screen, calling the same server action. |
| **Privacy disclosures** | Apple's "App Privacy" labels and Google's "Data safety" form, matching the privacy policy. | The policy's section 2 table is the source. Add any app-only data (push notification tokens, crash reports). |
| **In-app purchase for digital content** | A subscription bought inside the app must normally go through Apple's or Google's own billing, which take a 15% commission for small businesses. Rules on linking to the website to pay differ by country and are changing. | Not started. RevenueCat is planned to handle both stores. |
| **Subscription terms shown before purchase** | Price, length, auto-renewal, how to cancel, and links to the Terms and Privacy Policy on the purchase screen. | The website wording can be reused. |
| **Restore purchases** | A button to restore a subscription on a new device. | Not started. |
| **Medical content** | Educational apps with medical information must not claim to diagnose or treat. | The "revision aid, not clinical advice" wording is already in the product. |
| **AI-generated content** | Both stores ask apps to label AI content and let users report problems. | Ask Pinard is labelled, and questions can be reported. |

## Apple only

- **Sign in with Apple** is required if the app offers sign-in with another company's account (Google, Facebook). With email and password only, it is not required.
- **App Tracking Transparency** is not needed: Pinard does not track users across apps.
- Apple handles refunds for purchases made through Apple. The Refunds page will need a section saying so.

## Google only

- The Data safety form must also give a **web link for deleting an account** without installing the app. The website's Account page meets this.
- Google Play's subscription rules require a clear link to manage or cancel the subscription in Google Play.

## Privacy policy changes needed at that time

- Add **RevenueCat** (subscription management) and **Apple** and **Google** (payments) as recipients, with their locations.
- Add push notification tokens if the app sends notifications.
- Explain that refunds and withdrawal for app-store purchases are handled by the store.
