import { db } from "../db/client";
export const IDS = {
  admin: "00000000-0000-4000-8000-000000000001",
  analyst: "00000000-0000-4000-8000-000000000002",
  outsider: "00000000-0000-4000-8000-000000000003",
  health: "10000000-0000-4000-8000-000000000001",
  tech: "10000000-0000-4000-8000-000000000002",
  thc: "20000000-0000-4000-8000-000000000001",
  dram: "20000000-0000-4000-8000-000000000002",
};
export async function seed() {
  await db().begin(async (tx) => {
    for (const [id, subject, name, email, admin] of [
      [
        IDS.admin,
        "dev:admin",
        "Demo administrator",
        "admin@example.test",
        true,
      ],
      [
        IDS.analyst,
        "dev:analyst",
        "Healthcare analyst",
        "analyst@example.test",
        false,
      ],
      [
        IDS.outsider,
        "dev:technology",
        "Technology analyst",
        "technology@example.test",
        false,
      ],
    ] as const)
      await tx`insert into app_user(id,subject,name,email,admin) values(${id},${subject},${name},${email},${admin}) on conflict do nothing`;
    for (const [id, name] of [
      [IDS.health, "Healthcare"],
      [IDS.tech, "Technology"],
    ])
      await tx`insert into team(id,name) values(${id},${name}) on conflict do nothing`;
    for (const [team, user] of [
      [IDS.health, IDS.analyst],
      [IDS.tech, IDS.outsider],
    ])
      await tx`insert into membership(team_id,user_id,role) values(${team},${user},'lead') on conflict do nothing`;
    for (const [id, team, ticker, kind, owner, peers] of [
      [
        IDS.thc,
        IDS.health,
        "THC",
        "stock",
        IDS.analyst,
        "Synthetic healthcare peer basket",
      ],
      [
        IDS.dram,
        IDS.tech,
        "DRAM",
        "etf",
        IDS.outsider,
        "Synthetic constituents A and B",
      ],
    ])
      await tx`insert into holding(id,team_id,security_id,ticker,kind,owner_id,peers,questions,effective_from) values(${id},${team},${"SYNTH:" + ticker},${ticker},${kind},${owner},${peers},'What evidence would distinguish a company catalyst from a sector move?','2026-09-01') on conflict do nothing`;
  });
}
