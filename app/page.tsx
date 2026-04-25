import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const paymentLink = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK ?? "";

const painPoints = [
  {
    title: "Standups miss key people",
    body: "Remote teams spread across 8+ timezones pick one meeting time that is always painful for someone. Participation drops and blockers surface late.",
  },
  {
    title: "Manual reminders waste lead time",
    body: "Team leads spend 10-20 minutes daily pinging missing updates. That scales badly once the team grows past five people.",
  },
  {
    title: "Async updates get buried",
    body: "Without structured threads, replies scatter across channels and it becomes hard to see who has reported and who is blocked.",
  },
];

const solutionSteps = [
  {
    title: "Sync teammate timezones from Slack",
    detail:
      "Slack OAuth pulls real member timezone metadata so the scheduler sees when people are likely online and responsive.",
  },
  {
    title: "Pick the best overlap window",
    detail:
      "The optimizer scores every 30-minute slot and surfaces windows where the highest percentage of teammates are in practical working hours.",
  },
  {
    title: "Run standups automatically",
    detail:
      "Scheduled prompts post to your standup channel, collect replies in a single thread, and send reminder nudges to teammates who have not responded.",
  },
];

const faqs = [
  {
    question: "Does this replace synchronous standups?",
    answer:
      "For most distributed teams, yes. Async threaded updates preserve accountability without forcing one timezone to attend at an unreasonable hour.",
  },
  {
    question: "How long does setup take?",
    answer:
      "Most teams finish setup in under 10 minutes: connect Slack, choose channel/timezone, set standup prompt, and enable cron trigger on deployment.",
  },
  {
    question: "What team size is this built for?",
    answer:
      "Best fit is 5-50 people with cross-timezone collaboration and at least one dedicated team lead who tracks delivery blockers.",
  },
  {
    question: "Can I customize the prompt?",
    answer:
      "Yes. You can define your own standup template and reminder delay, then update it anytime from the dashboard.",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-14 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8 sm:p-12">
        <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute -bottom-28 right-0 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl" />

        <div className="relative max-w-3xl space-y-6">
          <Badge className="border-cyan-700 bg-cyan-500/15 text-cyan-200">slack-productivity</Badge>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-100 sm:text-5xl">
            Smart async standup scheduling across timezones
          </h1>
          <p className="text-base leading-7 text-slate-300 sm:text-lg">
            Automatically schedule standups when most team members are online, post threaded prompts in Slack,
            and send reminders to missing responders. Built for remote team leads managing 5+ people.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild className="bg-cyan-500 text-slate-950 hover:bg-cyan-400">
              <a href={paymentLink} target="_blank" rel="noreferrer">
                Buy Access - $15/mo
              </a>
            </Button>
            <Button asChild variant="outline" className="border-slate-700 text-slate-100 hover:bg-slate-900">
              <Link href="/dashboard">Open Dashboard</Link>
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Team Fit</p>
              <p className="mt-1 text-sm text-slate-200">Remote leads with 5+ engineers</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Primary Value</p>
              <p className="mt-1 text-sm text-slate-200">Higher standup completion rate</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Pricing</p>
              <p className="mt-1 text-sm text-slate-200">$15 per month, hosted checkout</p>
            </div>
          </div>
        </div>
      </section>

      <section id="problem" className="space-y-5">
        <div>
          <h2 className="text-2xl font-semibold text-slate-100 sm:text-3xl">The problem with timezone-heavy standups</h2>
          <p className="mt-2 max-w-3xl text-slate-400">
            Daily standups lose effectiveness when teams span multiple continents. The same people are always
            late or absent, and async updates become unreliable unless follow-up is automated.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {painPoints.map((pain) => (
            <Card key={pain.title} className="border-slate-800 bg-slate-950/60">
              <CardHeader>
                <CardTitle className="text-slate-100">{pain.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-slate-300">{pain.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section id="solution" className="space-y-5">
        <div>
          <h2 className="text-2xl font-semibold text-slate-100 sm:text-3xl">How it works</h2>
          <p className="mt-2 max-w-3xl text-slate-400">
            Slack Standup Scheduler turns timezone spread into a data problem, then automates the routine work
            that team leads usually do by hand.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {solutionSteps.map((step, index) => (
            <Card key={step.title} className="border-slate-800 bg-slate-950/60">
              <CardHeader>
                <CardDescription className="text-cyan-300">Step {index + 1}</CardDescription>
                <CardTitle className="text-slate-100">{step.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-slate-300">{step.detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section id="pricing" className="space-y-5">
        <Card className="border-cyan-700/50 bg-gradient-to-br from-cyan-500/10 via-slate-950 to-slate-950">
          <CardHeader>
            <CardTitle className="text-2xl text-slate-100">Simple pricing for distributed teams</CardTitle>
            <CardDescription className="text-slate-300">
              One plan, all features: timezone analyzer, scheduled standup threads, and automated reminder follow-ups.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-end gap-2">
              <p className="text-4xl font-bold text-slate-100">$15</p>
              <p className="pb-1 text-slate-400">per month</p>
            </div>

            <ul className="grid gap-2 text-sm text-slate-300">
              <li>Slack OAuth workspace sync</li>
              <li>Automated async standup threads</li>
              <li>Reminder nudges for missing updates</li>
              <li>Dashboard with overlap recommendations</li>
            </ul>

            <Button asChild size="lg" className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400 sm:w-auto">
              <a href={paymentLink} target="_blank" rel="noreferrer">
                Start Paid Plan
              </a>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section id="faq" className="space-y-5 pb-10">
        <div>
          <h2 className="text-2xl font-semibold text-slate-100 sm:text-3xl">FAQ</h2>
          <p className="mt-2 text-slate-400">Answers to the questions remote team leads ask before rollout.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {faqs.map((faq) => (
            <Card key={faq.question} className="border-slate-800 bg-slate-950/60">
              <CardHeader>
                <CardTitle className="text-base text-slate-100">{faq.question}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-slate-300">{faq.answer}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
