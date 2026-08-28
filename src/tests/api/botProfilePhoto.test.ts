import {readFileSync} from 'fs';
import {createTestClient, AccountSeed} from './harness';

const ENABLED = process.env.TG_API_TEST === '1';
const seedPath = process.env.TG_API_SEED;
// bot that the seed account owns (bot_can_edit) and that carries NO avatar,
// so the test can set one and remove it again without destroying anything
const BOT_USERNAME = process.env.TG_API_BOT || 'tweb_ephemeral_ui_25359431_bot';

const describeOrSkip = ENABLED && seedPath ? describe : describe.skip;

describeOrSkip('bot profile photo', () => {
  let client: Awaited<ReturnType<typeof createTestClient>>;

  beforeAll(async() => {
    const seed = JSON.parse(readFileSync(seedPath!, 'utf8')) as AccountSeed;
    client = await createTestClient({
      seed,
      testDc: process.env.TG_API_PROD_DC !== '1'
    });
    (client.apiManager as any).logOut = () => Promise.resolve();
  }, 60_000);

  afterAll(() => {
    client?.dispose();
  });

  test('upload then clear a bot avatar via photos.updateProfilePhoto', async() => {
    const resolved: any = await client.apiManager.invokeApi('contacts.resolveUsername', {username: BOT_USERNAME});
    const bot = resolved.users[0];
    expect(bot?.pFlags?.bot).toBe(true);
    expect(bot?.pFlags?.bot_can_edit).toBe(true);
    const inputUser = {_: 'inputUser' as const, user_id: bot.id, access_hash: bot.access_hash};

    const getPhoto = async() => {
      const users: any = await client.apiManager.invokeApi('users.getUsers', {id: [inputUser]});
      return users[0]?.photo;
    };

    console.log('  bot @' + BOT_USERNAME, 'photo before:', (await getPhoto())?._);

    // 1. upload.saveFilePart* -> InputFile
    const bytes = readFileSync('public/assets/img/logo_512.png');
    const inputFile = await client.managers.apiFileManager.upload({
      file: new Blob([bytes], {type: 'image/png'}),
      fileName: 'avatar.png'
    });
    console.log('  uploaded', inputFile._, 'parts:', (inputFile as any).parts);

    // 2. photos.uploadProfilePhoto with the bot flag
    const uploaded: any = await client.apiManager.invokeApi('photos.uploadProfilePhoto', {
      bot: inputUser,
      file: inputFile
    });
    console.log('  uploadProfilePhoto ->', uploaded?._, 'photo:', uploaded?.photo?._, uploaded?.photo?.id);
    expect(uploaded?._).toBe('photos.photo');
    expect(uploaded?.photo?._).toBe('photo');

    const afterUpload = await getPhoto();
    console.log('  photo after upload:', afterUpload?._, afterUpload?.photo_id);
    expect(afterUpload?._).toBe('userProfilePhoto');
    expect(String(afterUpload.photo_id)).toBe(String(uploaded.photo.id));

    // 3. photos.updateProfilePhoto{bot, inputPhotoEmpty} -> removal
    const cleared: any = await client.apiManager.invokeApi('photos.updateProfilePhoto', {
      bot: inputUser,
      id: {_: 'inputPhotoEmpty'}
    });
    console.log('  updateProfilePhoto(inputPhotoEmpty) ->', cleared?._, 'photo:', cleared?.photo?._);
    expect(cleared?._).toBe('photos.photo');
    expect(cleared?.photo?._).toBe('photoEmpty');

    const afterClear = await getPhoto();
    console.log('  photo after clear:', afterClear?._);
    expect(afterClear?._ === 'userProfilePhotoEmpty' || afterClear === undefined).toBe(true);
  }, 180_000);

  test('appProfileManager set + clearBotProfilePhoto', async() => {
    const peer: any = await client.managers.appUsersManager.resolveUsername(BOT_USERNAME);
    const botId: BotId = peer.id;
    const getLocalPhoto = () => (client.managers.appUsersManager.getUser(botId) as any)?.photo;

    const bytes = readFileSync('public/assets/img/logo_512.png');
    const file = await client.managers.apiFileManager.upload({
      file: new Blob([bytes], {type: 'image/png'}),
      fileName: 'avatar.png'
    });
    await client.managers.appProfileManager.uploadProfilePhoto({file, botId});
    console.log('  local photo after uploadProfilePhoto({botId}):', getLocalPhoto()?._);
    expect(getLocalPhoto()?._).toBe('userProfilePhoto');

    await client.managers.appProfileManager.clearBotProfilePhoto(botId);
    console.log('  local photo after clearBotProfilePhoto:', getLocalPhoto()?._);
    expect(getLocalPhoto()).toBeUndefined();

    const users: any = await client.apiManager.invokeApi('users.getUsers', {
      id: [{_: 'inputUser', user_id: botId, access_hash: peer.access_hash}]
    });
    console.log('  server photo after clearBotProfilePhoto:', users[0]?.photo?._);
    expect(users[0]?.photo).toBeUndefined();
  }, 180_000);
});
