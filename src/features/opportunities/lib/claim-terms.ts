/**
 * The standard terms a creator accepts when claiming a spot, from the hi-fi
 * design. They aren't stored per opportunity yet, so every company shares
 * them; only the company name changes.
 */
export function claimTerms(companyName: string): { title: string; body: string }[] {
  return [
    {
      title: "Eligibility.",
      body: "Creators must be 18 or older, have a public social account in good standing, and be legally able to enter into this agreement.",
    },
    {
      title: "Independent contractor.",
      body: `Creators participate as independent contractors, not employees, agents, or official representatives of ${companyName}.`,
    },
    {
      title: "Content ownership and usage rights.",
      body: `The creator retains ownership of their content. By submitting, the creator grants ${companyName} a non-exclusive, worldwide license to use, edit, and distribute the content on organic social, websites, and email for 12 months.`,
    },
    {
      title: "Exclusivity.",
      body: "Creators may not post sponsored content for competing products for 30 days before and after their posting date.",
    },
    {
      title: "Posting requirements.",
      body: "Approved content must be posted within 7 days of approval and remain live for at least 90 days.",
    },
    {
      title: "Compliance.",
      body: "Creators must follow all policy guidelines in this brief, FTC endorsement guidelines, and each platform's terms of service. Content that violates these guidelines may be rejected, and repeated or serious violations may result in termination without payment for the affected deliverable.",
    },
  ];
}
