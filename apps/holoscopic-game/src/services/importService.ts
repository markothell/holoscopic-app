const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface ImportResult {
  sequenceId: string;
  sequenceUrlName: string;
  activityCount: number;
}

export class ImportService {
  static async importSequence(file: File, userId: string): Promise<ImportResult> {
    const text = await file.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON file');
    }

    const res = await fetch(`${API_BASE_URL}/import/sequence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(json),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Import failed');
    return data as ImportResult;
  }
}
