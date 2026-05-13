// Fixture: a stand-in for src/client.ts used by the conformance test.
// Only the AST shape matters — these methods don't execute.

export interface ListOptionsBase {
  page?: number;
  limit?: number;
  shape?: string | null;
}

export interface ListFoosOptions extends ListOptionsBase {
  search?: string;
  awarding_agency?: string;
  fiscal_year?: number | string;
  ordering?: string;
}

export interface ListBarsOptions extends ListOptionsBase {
  // intentionally missing `awarding_agency` to trigger an error in the
  // "missing-filter" scenario
  search?: string;
  fiscal_year?: number | string;
  ordering?: string;
}

export interface ListBazOptions extends ListOptionsBase {
  // index signature soaks up missing filters → produces a warning
  search?: string;
  [key: string]: unknown;
}

export class MiniClient {
  async listFoos(_options: ListFoosOptions = {}): Promise<void> {
    return;
  }

  async listBars(_options: ListBarsOptions = {}): Promise<void> {
    return;
  }

  async listBaz(_options: ListBazOptions = {}): Promise<void> {
    return;
  }
}
