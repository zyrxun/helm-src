export interface AppTarget {
  name: string;
  urlToOpen?: string;
}

export interface Workflow {
  id: string;
  name: string;
  apps: AppTarget[];
}

export const userWorkflows: Workflow[] = [
  {
    id: "focus-mode",
    name: "Morning Stack",
    apps: [
      { name: "Spotify" },
      { name: "Google Chrome", urlToOpen: "https://github.com" }
    ]
  }
];
