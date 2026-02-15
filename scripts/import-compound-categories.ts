import postgres from "postgres";

interface Assignment {
  compound: string;
  categories: string;
}

interface CompoundSeed {
  name: string;
  slug: string;
  description: string;
  aliases: string[];
}

const COMPOUND_SEEDS: CompoundSeed[] = [
  {
    name: "Tirzepatide",
    slug: "tirzepatide",
    description: "Dual GIP/GLP-1 agonist peptide listings, including shorthand aliases like tirz and GLP-1 TZ.",
    aliases: ["Tirzepatide", "Tirz", "GLP-1 TZ", "GLP 1 TZ", "NG-TZ", "NG TZ"]
  },
  {
    name: "LL-37",
    slug: "ll-37",
    description: "Host-defense peptide listings, including vendor variants labeled as LL-37 Complex.",
    aliases: ["LL-37", "LL 37", "LL-37 Complex", "LL 37 Complex"]
  },
  {
    name: "Cagrilintide",
    slug: "cagrilintide",
    description: "Amylin analog peptide listings, including shorthand aliases like CAG.",
    aliases: ["Cagrilintide", "Cagrilinitide", "Cag", "CAG"]
  },
  {
    name: "CJC-1295 with DAC (and IPA)",
    slug: "cjc-1295-with-dac-and-ipa",
    description: "Blend entry for CJC-1295 with DAC combined with Ipamorelin.",
    aliases: [
      "CJC-1295 with DAC (and IPA)",
      "CJC-1295 with DAC",
      "CJC-1295 - With DAC",
      "CJC-1295 – With DAC",
      "CJC-1295 WITH DAC + IPA",
      "CJC-1295 + IPA (with DAC)",
      "CJC-1295/Ipamorelin with DAC"
    ]
  },
  {
    name: "CJC-1295 no DAC (with IPA)",
    slug: "cjc-1295-no-dac-with-ipa",
    description: "Blend entry for CJC-1295 no DAC combined with Ipamorelin.",
    aliases: [
      "CJC-1295 no DAC (with IPA)",
      "CJC-1295 NO DAC + IPA",
      "CJC-1295 + IPA (no DAC)",
      "CJC-1295/Ipamorelin no DAC"
    ]
  }
];

const ASSIGNMENTS: Assignment[] = [
  { compound: "5-AMINO-1MQ", categories: "Metabolic" },
  { compound: "AHK-CU", categories: "Cosmetic" },
  { compound: "AOD-9604", categories: "Fat loss" },
  { compound: "BAM-15", categories: "Metabolic" },
  { compound: "BPC-157", categories: "Healing" },
  { compound: "BPC-157 + KPV", categories: "Healing" },
  { compound: "BROMANTANE", categories: "Actoprotector" },
  { compound: "Cagrilintide", categories: "Fat loss" },
  { compound: "CJC-1295 with DAC (and IPA)", categories: "Growth hormone" },
  { compound: "CJC-1295 no DAC (with IPA)", categories: "Growth hormone" },
  { compound: "CJC-1295", categories: "Growth hormone" },
  { compound: "DIHEXA", categories: "Nootropic" },
  { compound: "DSIP", categories: "Sleep" },
  { compound: "EPITALON", categories: "Longevity" },
  { compound: "FOXO4-DRI", categories: "Senolytic" },
  { compound: "GHK-Cu", categories: "Cosmetic" },
  { compound: "GLOW", categories: "Cosmetic" },
  { compound: "GLOW 2.0", categories: "Cosmetic" },
  { compound: "GLUTATHIONE", categories: "Antioxidant" },
  { compound: "GW-0742", categories: "Metabolic" },
  { compound: "GW-501516", categories: "Metabolic" },
  { compound: "IGF-1 LR3", categories: "Growth Factor" },
  { compound: "ILLUMINATE", categories: "Cosmetic" },
  { compound: "IPAMORELIN", categories: "Growth hormone" },
  { compound: "KLOW", categories: "Healing blend" },
  { compound: "KPV", categories: "Anti inflammatory" },
  { compound: "LL-37", categories: "Immune" },
  { compound: "L-CARNITINE", categories: "Metabolic" },
  { compound: "LIPO-C / B12", categories: "Metabolic" },
  { compound: "MELANOTAN 1", categories: "Tanning" },
  { compound: "MELANOTAN 2", categories: "Tanning" },
  { compound: "METHYLENE BLUE", categories: "Mitochondrial" },
  { compound: "MK-677", categories: "Growth hormone" },
  { compound: "MOTS-C", categories: "Mitochondrial" },
  { compound: "NAD+", categories: "Longevity / Mitochondrial" },
  { compound: "NMN", categories: "Longevity / Mitochondrial" },
  { compound: "O-304", categories: "Metabolic" },
  { compound: "PT-141", categories: "Sexual Health" },
  { compound: "SELANK", categories: "Anxiolytic" },
  { compound: "SEMAX", categories: "Nootropic" },
  { compound: "SERMORELIN", categories: "Growth hormone" },
  { compound: "SLU-PP-332", categories: "Exercise mimetic" },
  { compound: "SNAP-8", categories: "Cosmetic" },
  { compound: "SR-9011", categories: "Metabolic" },
  { compound: "TB-500", categories: "Healing" },
  { compound: "Retatrutide", categories: "Fat loss" },
  { compound: "Tirzepatide", categories: "Fat loss" },
  { compound: "TESAMORELIN", categories: "Growth hormone" },
  { compound: "TESOFENSINE", categories: "Appetite suppressant" },
  { compound: "THERMOGENIX", categories: "Fat loss" },
  { compound: "THYMOSIN ALPHA-1", categories: "Immune" }
];

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function sslMode(): "require" | false {
  return process.env.DATABASE_SSL_MODE === "disable" ? false : "require";
}

function prepareMode(): boolean {
  return process.env.DATABASE_PREPARE === "true";
}

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseCategoryNames(input: string): string[] {
  const values = input
    .split("/")
    .map((part) => part.trim().replace(/\s+/g, " "))
    .filter(Boolean);

  return Array.from(new Set(values));
}

function buildAssignmentCompoundSeeds(assignments: Assignment[]): Array<{ name: string; slug: string; description: string }> {
  const bySlug = new Map<string, { name: string; slug: string; description: string }>();

  for (const assignment of assignments) {
    const slug = toSlug(assignment.compound);
    if (!slug) {
      continue;
    }

    if (bySlug.has(slug)) {
      continue;
    }

    bySlug.set(slug, {
      name: assignment.compound,
      slug,
      description: `Curated taxonomy seed for ${assignment.categories}.`
    });
  }

  return Array.from(bySlug.values());
}

async function main(): Promise<void> {
  const sql = postgres(required("DATABASE_URL"), {
    max: 1,
    ssl: sslMode(),
    prepare: prepareMode()
  });

  try {
    const assignmentSeeds = buildAssignmentCompoundSeeds(ASSIGNMENTS);

    for (const seed of assignmentSeeds) {
      await sql`
        insert into compounds (name, slug, description)
        values (${seed.name}, ${seed.slug}, ${seed.description})
        on conflict (slug) do update
        set is_active = true,
            description = coalesce(compounds.description, excluded.description),
            updated_at = now()
      `;
    }

    for (const seed of COMPOUND_SEEDS) {
      await sql`
        insert into compounds (name, slug, description)
        values (${seed.name}, ${seed.slug}, ${seed.description})
        on conflict (slug) do update
        set name = excluded.name,
            description = excluded.description,
            is_active = true,
            updated_at = now()
      `;
    }

    const compounds = await sql<
      {
        id: string;
        name: string;
        slug: string;
      }[]
    >`
      select id, name, slug
      from compounds
      where is_active = true
      order by name asc
    `;

    const compoundByKey = new Map<string, { id: string; name: string; slug: string }>();
    for (const compound of compounds) {
      compoundByKey.set(normalizeKey(compound.name), compound);
      compoundByKey.set(normalizeKey(compound.slug), compound);
    }

    for (const seed of COMPOUND_SEEDS) {
      const compound = compounds.find((item) => item.slug === seed.slug);
      if (!compound) {
        continue;
      }

      for (const alias of seed.aliases) {
        const aliasNormalized = normalizeKey(alias);
        await sql`
          insert into compound_aliases (compound_id, alias, alias_normalized, source, confidence, status)
          values (${compound.id}, ${alias}, ${aliasNormalized}, 'rules', 1.0, 'resolved')
          on conflict (alias_normalized) do update
          set compound_id = excluded.compound_id,
              alias = excluded.alias,
              source = excluded.source,
              confidence = excluded.confidence,
              status = excluded.status,
              updated_at = now()
        `;
      }
    }

    const categoryNames = Array.from(
      new Set(
        ASSIGNMENTS.flatMap((entry) => parseCategoryNames(entry.categories))
      )
    ).sort((a, b) => a.localeCompare(b));

    const categoryIdByName = new Map<string, string>();
    for (const categoryName of categoryNames) {
      const rows = await sql<{ id: string }[]>`
        insert into categories (name, slug)
        values (${categoryName}, ${toSlug(categoryName)})
        on conflict (slug) do update
        set name = excluded.name,
            updated_at = now()
        returning id
      `;

      categoryIdByName.set(categoryName, rows[0].id);
    }

    const applied: Array<{ compound: string; slug: string; categories: string[] }> = [];
    const unresolved: string[] = [];

    await sql.begin(async (tx) => {
      const q = tx as unknown as typeof sql;

      for (const entry of ASSIGNMENTS) {
        const compound = compoundByKey.get(normalizeKey(entry.compound));
        if (!compound) {
          unresolved.push(entry.compound);
          continue;
        }

        const categories = parseCategoryNames(entry.categories);
        const categoryIds = categories
          .map((name) => categoryIdByName.get(name))
          .filter((value): value is string => Boolean(value));

        if (categoryIds.length === 0) {
          unresolved.push(entry.compound);
          continue;
        }

        await q`
          delete from compound_category_map
          where compound_id = ${compound.id}
            and category_id not in ${q(categoryIds)}
        `;

        await q`
          update compound_category_map
          set is_primary = false,
              updated_at = now()
          where compound_id = ${compound.id}
        `;

        for (const [index, categoryId] of categoryIds.entries()) {
          const isPrimary = index === 0;
          await q`
            insert into compound_category_map (compound_id, category_id, is_primary)
            values (${compound.id}, ${categoryId}, ${isPrimary})
            on conflict (compound_id, category_id) do update
            set is_primary = excluded.is_primary,
                updated_at = now()
          `;
        }

        applied.push({
          compound: compound.name,
          slug: compound.slug,
          categories
        });
      }
    });

    const categoryCoverage = await sql<
      {
        categoryName: string;
        mappedCompounds: number;
      }[]
    >`
      select
        cat.name as category_name,
        count(distinct ccm.compound_id)::int as mapped_compounds
      from categories cat
      left join compound_category_map ccm on ccm.category_id = cat.id
      group by cat.id, cat.name
      order by cat.name asc
    `;

    console.log(
      JSON.stringify(
        {
          seededCompoundCount: assignmentSeeds.length,
          totalAssignments: ASSIGNMENTS.length,
          appliedCount: applied.length,
          unresolvedCount: unresolved.length,
          unresolved,
          applied,
          categoryCoverage
        },
        null,
        2
      )
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
