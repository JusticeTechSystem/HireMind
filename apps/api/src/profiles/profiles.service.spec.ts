import { ProfilesService } from './profiles.service';
describe('ProfilesService.completion', () => {
  it('is 0 for no profile', () => expect(ProfilesService.completion(null)).toBe(0));
  it('is 100 when all required fields set', () => {
    expect(ProfilesService.completion({ fullName: 'A B', title: 't', careerLevel: 'mid', yearsExperience: 0,
      industry: 'i', specialization: 's', languages: ['ts'], frameworks: ['nest'], interviewCategory: 'mixed', answerStyle: 'STAR' })).toBe(100);
  });
  it('treats empty arrays as incomplete', () => {
    expect(ProfilesService.completion({ fullName: 'A B', languages: [] })).toBeLessThan(100);
  });
});
