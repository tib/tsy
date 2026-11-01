---
type: post
slug: one-small-refactor-at-a-time
title: "One small refactor at a time"
description: "A small, well-chosen refactor can make the next change easier without turning cleanup into a rewrite."
publication: "2026-10-28 09:15:00"
authors:
    - tibor-bodecs
tags:
    - swift
    - software
    - focus
---

There is a particular temptation in an older codebase: once I notice one awkward function, I start imagining a complete redesign. The new version is elegant in my head, but the rewrite can quickly grow beyond the problem I meant to solve.

I have had better results by asking what the next change needs. Maybe a name is unclear. Maybe a repeated conditional deserves a small helper. Maybe a type can express an invariant that is currently hidden in comments.

One careful edit gives me a chance to run through the surrounding behavior before moving on. The code becomes a little easier to understand, and I keep the scope connected to a real need.

This is not a rule against larger refactors. It is a reminder to earn them. Small steps make the direction visible and leave room to change course when the code teaches me something new.
