type RegisterEntry<ToCheck, Payload> = {
  check: (value: ToCheck) => boolean;
  payload: Payload;
};

export class Register<ToCheck, Payload> {
  private entries: RegisterEntry<ToCheck, Payload>[] = [];

  addEntry(entry: RegisterEntry<ToCheck, Payload>): void {
    this.entries.push(entry);
  }

  hasEntryFor(value: ToCheck): boolean {
    return this.entries.some(entry => entry.check(value));
  }

  getEntry(value: ToCheck): Payload | undefined {
    for(const entry of this.entries) {
      if(entry.check(value)) {
        return entry.payload;
      }
    }
  }
}
