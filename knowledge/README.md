# NYN Knowledge Base

Drop `.md` files in this folder and NYN will load them all at startup.

## How it works

- Every `.md` file in this directory is read on boot
- The contents are injected into NYN's system prompt as background knowledge
- NYN can reference this information when answering your questions
- Edit or add files anytime — restart the bot to pick up changes

## Suggested structure

```
knowledge/
├── company.md          # Company overview, mission, values
├── products.md         # Products and services
├── team.md             # Key team members and roles
├── processes.md        # Internal processes and workflows
├── clients.md          # Key clients and relationships
├── brand-voice.md      # Tone, style, terminology
└── faq.md              # Common questions and answers
```

## Tips

- Keep each file focused on one topic
- Use headers and bullet points for scannability
- Include specific facts, numbers, and names — NYN can only reference what's here
- Total knowledge should stay under ~50KB to avoid hitting token limits
