export interface GoogleProfile {
  id: string;
  emails: { value: string }[];
  name: {
    givenName: string;
    familyName: string;
  };
}
