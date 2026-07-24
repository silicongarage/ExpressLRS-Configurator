import {
  Arg,
  Mutation,
  Query,
  Resolver,
  Root,
  Subscription,
} from 'type-graphql';
import { Service } from 'typedi';
import UserDefine from '../../models/UserDefine';
import BuildFlashFirmwareInput from '../inputs/BuildFlashFirmwareInput';
import BuildFlashFirmwareResult from '../objects/BuildFlashFirmwareResult';
import BuildProgressNotification from '../../models/BuildProgressNotification';
import PubSubTopic from '../../pubsub/enum/PubSubTopic';
import BuildLogUpdate from '../../models/BuildLogUpdate';
import ClearPlatformioCoreDirResult from '../objects/ClearPlatformioCoreDirResult';
import TargetDeviceOptionsArgs from '../args/TargetDeviceOptions';
import ClearFirmwareFilesResult from '../objects/ClearFirmwareFilesResult';
import TargetArgs from '../args/Target';
import Device from '../../models/Device';
import GitRepository from '../inputs/GitRepositoryInput';
import FirmwareSource from '../../models/enum/FirmwareSource';
import PullRequest from '../../models/PullRequest';
import FlashingStrategyLocatorService from '../../services/FlashingStrategyLocator';
import { BuildProgressNotificationPayload } from '../../services/FlashingStrategyLocator/BuildProgressNotificationPayload';
import { BuildLogUpdatePayload } from '../../services/FlashingStrategyLocator/BuildLogUpdatePayload';
import Platformio from '../../library/Platformio';

@Service()
@Resolver()
export default class FirmwareResolver {
  constructor(
    private flashingStrategyLocatorService: FlashingStrategyLocatorService,
    private platformio: Platformio,
  ) {}

  @Query(() => [Device])
  async availableFirmwareTargets(
    // Explicit @Arg per field — @Args(() => TargetArgs) lost its mapping
    // after buildSchema ran a second time on macOS Close→Open
    @Arg('gitRepository', () => GitRepository) gitRepository: GitRepository,
    @Arg('source', () => FirmwareSource) source: FirmwareSource,
    @Arg('gitTag', () => String) gitTag: string,
    @Arg('gitBranch', () => String) gitBranch: string,
    @Arg('gitCommit', () => String) gitCommit: string,
    @Arg('localPath', () => String) localPath: string,
    @Arg('gitPullRequest', () => PullRequest, { nullable: true }) gitPullRequest: PullRequest | null,
  ): Promise<Device[]> {
    const args = new TargetArgs();
    args.source = source;
    args.gitTag = gitTag;
    args.gitBranch = gitBranch;
    args.gitCommit = gitCommit;
    args.localPath = localPath;
    args.gitPullRequest = gitPullRequest;
    const strategy = await this.flashingStrategyLocatorService.locate(args, gitRepository);
    return strategy.availableFirmwareTargets(args, gitRepository);
  }

  @Query(() => [UserDefine])
  async targetDeviceOptions(
    // Same pattern — explicit @Arg per field to avoid schema corruption
    @Arg('gitRepository', () => GitRepository) gitRepository: GitRepository,
    @Arg('target', () => String) target: string,
    @Arg('source', () => FirmwareSource) source: FirmwareSource,
    @Arg('gitTag', () => String) gitTag: string,
    @Arg('gitBranch', () => String) gitBranch: string,
    @Arg('gitCommit', () => String) gitCommit: string,
    @Arg('localPath', () => String) localPath: string,
    @Arg('gitPullRequest', () => PullRequest, { nullable: true }) gitPullRequest: PullRequest | null,
  ): Promise<UserDefine[]> {
    const args = new TargetDeviceOptionsArgs();
    args.target = target;
    args.source = source;
    args.gitTag = gitTag;
    args.gitBranch = gitBranch;
    args.gitCommit = gitCommit;
    args.localPath = localPath;
    args.gitPullRequest = gitPullRequest;
    const strategy = await this.flashingStrategyLocatorService.locate(args, gitRepository);
    return strategy.targetDeviceOptions(args, gitRepository);
  }

  @Mutation(() => BuildFlashFirmwareResult)
  async buildFlashFirmware(
    @Arg('input', () => BuildFlashFirmwareInput) input: BuildFlashFirmwareInput,
    @Arg('gitRepository', () => GitRepository) gitRepository: GitRepository,
  ): Promise<BuildFlashFirmwareResult> {
    const strategy = await this.flashingStrategyLocatorService.locate(
      input.firmware,
      gitRepository,
    );
    return strategy.buildFlashFirmware(input, gitRepository);
  }

  @Mutation(() => ClearPlatformioCoreDirResult)
  async clearPlatformioCoreDir(): Promise<ClearPlatformioCoreDirResult> {
    try {
      await this.platformio.clearPlatformioCoreDir();
      return new ClearPlatformioCoreDirResult(true);
    } catch (e) {
      return new ClearPlatformioCoreDirResult(
        false,
        `Failed to clear platformio state: ${e}`,
      );
    }
  }

  @Mutation(() => ClearFirmwareFilesResult)
  async clearFirmwareFiles(): Promise<ClearFirmwareFilesResult> {
    try {
      await this.flashingStrategyLocatorService.clearFirmwareFiles();
      return new ClearFirmwareFilesResult(true);
    } catch (e) {
      return new ClearFirmwareFilesResult(
        false,
        `Failed to clear firmware files cache: ${e}`,
      );
    }
  }

  @Subscription(() => BuildProgressNotification, {
    topics: [PubSubTopic.BuildProgressNotification],
  })
  buildProgressNotifications(
    @Root() n: BuildProgressNotificationPayload,
  ): BuildProgressNotification {
    return new BuildProgressNotification(n.type, n.step, n.substep, n.progress);
  }

  @Subscription(() => BuildLogUpdate, {
    topics: [PubSubTopic.BuildLogsUpdate],
  })
  buildLogUpdates(@Root() u: BuildLogUpdatePayload): BuildLogUpdate {
    return new BuildLogUpdate(u.data);
  }
}
