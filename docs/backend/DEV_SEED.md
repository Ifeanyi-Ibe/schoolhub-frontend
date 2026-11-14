# Development seed

`seed-demo` fills a local or staging database with one complete school, so the frontend and the API can be tested end to end. This page lists the
school, the accounts and the platform developer's TOTP secret. **These credentials are published on purpose and are for a developer's own machine.**
They are created only in Development. The production process refuses to start while any of them exists.

## Where things are

| Item | Value |
|---|---|
| School slug | `demo` (sign in with the host `demo.localhost`, or with the `X-Tenant: demo` header in Development) |
| Session | `2026/2027` (current), term 1 "First Term" (current), term 2 "Second Term" |
| Dataset | 40 students across JSS 1 A (14), JSS 1 B (13) and JSS 2 A (13). Admission numbers `DEV/26/0001` to `DEV/26/0040` |
| Plan | `dev-all`, which grants every feature (`customRoles`, `admissions`). It exists only in Development and Staging |

## Accounts (Development)

One password for every account that has one: **`Dev-Only-Passw0rd-2034`**.

| Role | Sign in with | Notes |
|---|---|---|
| SchoolAdmin | `admin@demo.example.com` | Holds every school permission |
| Registrar | `registrar@demo.example.com` | Students and admissions |
| Bursar | `bursar@demo.example.com` | Fees and payments, no medical data |
| Teacher | `teacher@demo.example.com` | Linked to the staff member Adaeze Eze; teaches Mathematics and English in JSS 1 A and B |
| FormTeacher | `formteacher@demo.example.com` | Linked to the staff member Ngozi Obi; form teacher of JSS 1 A |
| Parent | **phone `+2348011000001`**, by one-time code | Guardian of `DEV/26/0001` (Peter Eze). Signs in by SMS code, not password |
| Platform developer | `platform.dev@schoolhub.dev.invalid` | A platform account (no school). Sign in at `/api/v1/platform/auth/login` with the password, then the TOTP code |

### Platform developer's TOTP secret

Add this as a manual key in an authenticator app (base32, 6 digits, 30 seconds, SHA-1):

```
GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
```

The account already has MFA enrolled, so the sign-in asks for the code.

### Parent sign-in (phone code)

In Development the API keeps the last message sent to each recipient, so the code is readable:

```sh
# 1. ask for a code (the school is named by the host or X-Tenant)
curl -X POST http://localhost:5152/api/v1/auth/otp/request \
  -H "X-Tenant: demo" -H "Content-Type: application/json" -d '{"phone":"+2348011000001"}'

# 2. read the code that was sent (Development only; this route does not exist in Staging or Production)
curl "http://localhost:5152/api/v1/dev/messages/latest?to=%2B2348011000001"

# 3. verify with the six digits in the message body ("Your code is 123456.")
curl -X POST http://localhost:5152/api/v1/auth/otp/verify \
  -H "X-Tenant: demo" -H "Content-Type: application/json" -d '{"phone":"+2348011000001","code":"123456"}'
```

The code expires in the time set by the OTP settings, and each phone has a resend cooldown.

## What the dataset contains

- **Academics:** the product's default assessment and grading schemes; levels JSS 1 and JSS 2; arms JSS 1 A, JSS 1 B and JSS 2 A; subjects
  Mathematics, English Language, Basic Science and Social Studies, mapped to both levels.
- **Staff and teaching:** four staff members; ten teacher assignments for 2026/2027; JSS 1 A's form teacher is Ngozi Obi.
- **Students and guardians:** 40 students, each with one guardian (guardian of the first student is the parent phone above).
- **Attendance:** a register for each arm on 9, 10, 11, 12 and 13 November 2026, submitted.
- **Fees:** term 1 structures for JSS 1 (tuition ₦45,000 and development levy ₦5,000) and JSS 2 (tuition ₦50,000 and levy ₦5,000), active.
  Forty invoices for term 1. Fourteen are **paid** in full. Thirteen are **part-paid** (half paid). Thirteen have **nothing paid**.
- **Overdue:** the due date is 15 October 2026. The product's overdue sweep runs over the dataset, so every unpaid invoice and every part-paid invoice
  past that date reads `Overdue`. A part-paid invoice is therefore identified by `paidKobo > 0` and a balance still due, not by its status.
- **Payments:** 27 cash payments (reference `DEV-PAY-26-0001` onward, one per paid or part-paid student), dated 5 October 2026.
- **Results (term 1):** JSS 1 A has all four subjects approved, computed, report cards generated and **published** (14 report cards).
  JSS 1 B has all four subjects approved and computed, **not published**. JSS 2 A has one sheet (Mathematics) **started and not submitted**.

## Running it

```sh
make migrate                       # the schema must exist first
set -a; . ./.env; set +a           # the database connection strings
ASPNETCORE_ENVIRONMENT=Development dotnet run --no-launch-profile \
  --project src/SchoolHub.Api -- seed-demo
```

Staging (no development accounts; the administrator's password comes from the environment):

```sh
ASPNETCORE_ENVIRONMENT=Staging SCHOOLHUB_DEMO_ADMIN_PASSWORD='a-long-password' \
  dotnet run --no-launch-profile --project src/SchoolHub.Api -- seed-demo
```

Options: `--slug <slug>` (default `demo`), `--email <address>` (default `admin@demo.example.com`), `--students <count>` (default 40; a larger
count adds bulk students to JSS 1 A, for load tests).

## Behaviour you can rely on

- **Idempotent.** Each step looks for its natural key first. A second run prints `added 0` and changes no row. The test
  `The_dataset_is_complete_and_a_second_run_changes_nothing` checks every count.
- **Uses the product's commands.** The data goes through the same commands the endpoints call, so the rules hold (for example, a part-paid invoice
  is overdue after its due date). The seed acts as the school's administrator, through the same request context, so the audit trail names an actor.
- **Refuses Production.** The command and the seeding service both refuse, and the seed never runs in another environment.
- **Staging gets no dev accounts.** It creates the school, the data and the administrator with the environment's password. It never writes the
  documented password, the platform developer or the TOTP secret. The dev message route does not exist there.
- **Production refuses to start over seed data.** `DevSeedProductionGuard` checks, at start-up, for any dev account (the emails above, or the parent's
  phone) and for the `dev-all` plan. If it finds one, the process stops and names what it found. It never names a password.

## If your database was seeded earlier

A database seeded before this dataset existed keeps the older rows: a session `2034/2035`, its term, and five students (`DEMO/34/...`). The new
dataset is added beside them. The administrator account `admin@demo.example.com` is updated to the documented password. Nothing is deleted.

## Removing it

Development data can be removed by dropping the database (`docker compose down -v`, then `make up` and `make migrate`). Never remove dev rows from a
database that holds real data; the production guard exists so that such a database cannot start with them.
