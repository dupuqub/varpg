// Which build this is, so the player can tell which version he is playing. Run from the files on a computer it says "local"; the
// publishing workflow (.github/workflows/pages.yml) writes the commit and the time of the publication over this file in the copy
// it publishes. It is shown on the entry screen and printed by ENVIRONMENT in Chamber 0. Nothing in the game reads it.
const BUILD = { commit: "local", date: "" };
