import Link from "next/link";
import Image from "next/image";

import { formatMetricLabel, formatPriceCents } from "@/lib/metrics";
import type { HomeCard as HomeCardType } from "@/lib/types";

interface HomeCardProps {
  card: HomeCardType;
}

export function HomeCard({ card }: HomeCardProps) {
  return (
    <article className="card-shell">
      <Link className="card-image" href={`/peptides/${card.compoundSlug}`}>
        <Image src={card.imageUrl} alt={`${card.compoundName} placeholder`} fill sizes="(max-width: 840px) 100vw, 220px" />
      </Link>

      <div className="card-content">
        <div className="card-title-row">
          <h2>{card.compoundName}</h2>
          <span className="badge">{card.categoryName ?? "Uncategorized"}</span>
        </div>

        <p className="metric-line">
          {formatMetricLabel(card.heroMetricType)}: <strong>{formatPriceCents(card.heroMetricPrice)}</strong>
        </p>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vendor</th>
                <th>{formatMetricLabel(card.heroMetricType)}</th>
                <th>Finnrick</th>
              </tr>
            </thead>
            <tbody>
              {card.rows.map((row) => (
                <tr key={`${card.compoundSlug}-${row.vendorId}`}>
                  <td>
                    <a href={row.vendorUrl} target="_blank" rel="noopener noreferrer nofollow">
                      {row.vendorName}
                    </a>
                  </td>
                  <td>{formatPriceCents(row.metricPrice)}</td>
                  <td>
                    <span className="rating-badge">{row.finnrickRating ?? "N/A"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </article>
  );
}
