# School Van Guardian

Create a production-ready multi-tenant SaaS platform named School Van Tracking & Management System.

Use:

Firebase Authentication

Cloud Firestore

Firebase Storage

Firebase Cloud Messaging

The system must support multiple schools using a schoolId field on every document so that each school's data is completely isolated.

Create four user roles:

Super Admin

School Admin

Driver

Parent

Use role-based authentication.

Create a modern responsive web application using TypeScript.

Prepare the project architecture so Android apps developed later in Flutter can connect to the same Firebase backend without changing the database.

Create a clean folder structure.

Include:

Authentication

Dashboard Layout

Sidebar

Navigation

User Profile

Dark/Light Mode

Responsive Design

Create Firestore collections:

Schools

Users

Students

Parents

Drivers

Vehicles

Routes

Trips

QRLogs

SpeedLogs

Notifications

Subscriptions

Configure Firebase Security Rules so users can only access data belonging to their own school.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://projectjmi.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/fb8d8d0e-6aa9-4daf-94fb-047d3d9fba00).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
