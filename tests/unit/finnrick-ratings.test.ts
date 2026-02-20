import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/test";
process.env.ADMIN_EMAIL ??= "stacktracker@proton.me";
process.env.ADMIN_AUTH_SECRET ??= "1234567890123456";
process.env.CRON_SECRET ??= "1234567890123456";

describe("parseFinnrickRows", () => {
  it("reads Finnrick Ratings range values from the dedicated column", async () => {
    const { parseFinnrickRows } = await import("@/lib/jobs/finnrick");

    const html = `
      <table>
        <tbody>
          <tr>
            <td></td>
            <td>Paradigm Peptide</td>
            <td>A</td>
            <td>2</td>
            <td>16</td>
          </tr>
          <tr>
            <td></td>
            <td>Peptide Partners</td>
            <td>toAC</td>
            <td>5</td>
            <td>40</td>
          </tr>
          <tr>
            <td></td>
            <td>Example Vendor</td>
            <td>N/A</td>
            <td>1</td>
            <td>8</td>
          </tr>
        </tbody>
      </table>
    `;

    expect(parseFinnrickRows(html)).toEqual([
      { vendorName: "Paradigm Peptide", rating: null, ratingLabel: "A" },
      { vendorName: "Peptide Partners", rating: null, ratingLabel: "A to C" },
      { vendorName: "Example Vendor", rating: null, ratingLabel: "N/A" }
    ]);
  });
});
