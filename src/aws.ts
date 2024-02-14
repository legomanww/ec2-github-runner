import {
  BlockDeviceMapping,
  EC2Client,
  InstanceMarketOptionsRequest,
  RunInstancesCommand,
  RunInstancesCommandInput,
  TerminateInstancesCommand,
  waitUntilInstanceRunning,
} from '@aws-sdk/client-ec2';
import * as core from '@actions/core';
import { ConfigInterface } from './config';
import { GithubUtils } from './gh';

export class AwsUtils {
  config: ConfigInterface;
  gh: GithubUtils;

  constructor(config: ConfigInterface) {
    this.config = config;
    this.gh = new GithubUtils(config);
  }

  // User data scripts are run as the root user
  async buildUserDataScript(githubRegistrationToken: string): Promise<string[]> {
    core.info(`Building data script for ${this.config.ec2Os}`);

    const runnerVersion = await this.gh.getRunnerVersion();

    if (this.config.ec2Os === 'windows') {
      // Name the instance the same as the label to avoid machine name conflicts in GitHub.
      if (this.config.githubRunnerHomeDir !== '') {
        // If runner home directory is specified, we expect the actions-runner software (and dependencies)
        // to be pre-installed in the AMI, so we simply cd into that directory and then start the runner
        return [
          '<powershell>',
          'winrm quickconfig -q',
          `winrm set winrm/config/service/Auth '@{Basic="true"}'`,
          `winrm set winrm/config/service '@{AllowUnencrypted="true"}'`,
          `winrm set winrm/config/winrs '@{MaxMemoryPerShellMB="0"}'`,

          `cd "${this.config.githubRunnerHomeDir}"`,
          `echo "${this.config.githubRunnerPreRunnerScript}" > pre-runner-script.ps1`,
          '& pre-runner-script.ps1',
          `./config.cmd --url https://github.com/${this.config.githubOwner}/${this.config.githubRepo} --token ${githubRegistrationToken} --labels ${this.config.githubActionRunnerLabel} --name ${this.config.githubActionRunnerLabel} --unattended`,
          './run.cmd',
          '</powershell>',
          '<persist>false</persist>',
        ];
      } else {
        return [
          '<powershell>',
          'winrm quickconfig -q',
          `winrm set winrm/config/service/Auth '@{Basic="true"}'`,
          `winrm set winrm/config/service '@{AllowUnencrypted="true"}'`,
          `winrm set winrm/config/winrs '@{MaxMemoryPerShellMB="0"}'`,

          'mkdir actions-runner; cd actions-runner',
          `echo "${this.config.githubRunnerPreRunnerScript}" > pre-runner-script.ps1`,
          '& pre-runner-script.ps1',
          `Invoke-WebRequest -Uri https://github.com/actions/runner/releases/download/v${runnerVersion}/actions-runner-win-x64-${runnerVersion}.zip -OutFile actions-runner-win-x64-${runnerVersion}.zip`,
          `Add-Type -AssemblyName System.IO.Compression.FileSystem ; [System.IO.Compression.ZipFile]::ExtractToDirectory("$PWD/actions-runner-win-x64-${runnerVersion}.zip", "$PWD")`,
          `./config.cmd --url https://github.com/${this.config.githubOwner}/${this.config.githubRepo} --token ${githubRegistrationToken} --labels ${this.config.githubActionRunnerLabel} --name ${this.config.githubActionRunnerLabel} --unattended`,
          './run.cmd',
          '</powershell>',
          '<persist>false</persist>',
        ];
      }
    } else if (this.config.ec2Os === 'linux') {
      if (this.config.githubRunnerHomeDir !== '') {
        // If runner home directory is specified, we expect the actions-runner software (and dependencies)
        // to be pre-installed in the AMI, so we simply cd into that directory and then start the runner
        return [
          '#!/bin/bash',
          `cd "${this.config.githubRunnerHomeDir}"`,
          `echo "${this.config.githubRunnerPreRunnerScript}" > pre-runner-script.sh`,
          'source pre-runner-script.sh',
          'export RUNNER_ALLOW_RUNASROOT=1',
          `./config.sh --url https://github.com/${this.config.githubOwner}/${this.config.githubRepo} --token ${githubRegistrationToken} --labels ${this.config.githubActionRunnerLabel}`,
          './run.sh',
        ];
      } else {
        return [
          '#!/bin/bash',
          'mkdir actions-runner && cd actions-runner',
          `echo "${this.config.githubRunnerPreRunnerScript}" > pre-runner-script.sh`,
          'source pre-runner-script.sh',
          `curl -o actions-runner-linux-x64-${runnerVersion}.tar.gz -L https://github.com/actions/runner/releases/download/v${runnerVersion}/actions-runner-linux-x64-${runnerVersion}.tar.gz`,
          `tar xzf ./actions-runner-linux-x64-${runnerVersion}.tar.gz`,
          'export RUNNER_ALLOW_RUNASROOT=1',
          `./config.sh --url https://github.com/${this.config.githubOwner}/${this.config.githubRepo} --token ${githubRegistrationToken} --labels ${this.config.githubActionRunnerLabel}`,
          './run.sh',
        ];
      }
    } else {
      core.error('Not supported ec2-os.');
      return [];
    }
  }

  buildMarketOptions(): InstanceMarketOptionsRequest | undefined {
    if (this.config.ec2MarketType === 'spot') {
      return {
        MarketType: this.config.ec2MarketType,
        SpotOptions: {
          SpotInstanceType: 'one-time',
        },
      };
    }

    return undefined;
  }

  buildBlockMappings(): BlockDeviceMapping[] | undefined {
    if (this.config.ec2StorageSize === undefined &&
      this.config.ec2StorageIops === undefined &&
      this.config.ec2StorageType === undefined &&
      this.config.ec2StorageThroughput === undefined) {
      return undefined;
    }

    return [
      {
        DeviceName: this.config.ec2StorageDeviceName,
        Ebs: {
          DeleteOnTermination: true,
          VolumeSize: this.config.ec2StorageSize,
          Iops: this.config.ec2StorageIops,
          VolumeType: this.config.ec2StorageType,
          Throughput: this.config.ec2StorageThroughput,
        },
      },
    ];
  }

  buildKeyConfig(): string | undefined {
    if (this.config.awsKeyPairName === undefined ||
      this.config.awsKeyPairName === '') {
      return undefined;
    }

    return this.config.awsKeyPairName;
  }

  async startEc2Instance(githubRegistrationToken: string): Promise<string | undefined> {
    const client = new EC2Client();

    const userData = await this.buildUserDataScript(githubRegistrationToken);

    const params: RunInstancesCommandInput = {
      ImageId: this.config.ec2AmiId,
      InstanceType: this.config.ec2InstanceType,
      MinCount: 1,
      MaxCount: 1,
      UserData: Buffer.from(userData.join('\n')).toString('base64'),
      SecurityGroupIds: [this.config.ec2SecurityGroupId],
      IamInstanceProfile: { Name: this.config.awsIamRoleName },
      KeyName: this.buildKeyConfig(),
      TagSpecifications: this.config.ec2InstanceTags,
      InstanceMarketOptions: this.buildMarketOptions(),
      BlockDeviceMappings: this.buildBlockMappings(),
      SubnetId: this.config.ec2SubnetId,
    };

    const maxRetries = this.config.ec2MaxRetries;
    let retryCount = 0;

    core.group("AWS Run Instance params", async () => {
      const {UserData: _, ...simpleParams} = params;
      core.info(JSON.stringify(simpleParams, null, 2));
    });

    while (retryCount < maxRetries) {
      core.info(`Starting AWS EC2 instance... (Attempt ${retryCount}/${maxRetries})`);
      
      try {
        const command = new RunInstancesCommand(params);
        const result = await client.send(command);
        if (result.Instances?.length === 1) {
          const ec2InstanceId = result.Instances[0].InstanceId;
          core.info(`AWS EC2 instance ${ec2InstanceId} has started`);
          return ec2InstanceId;
        }
      } catch (error) {
        core.error('AWS EC2 instance starting error');
        core.group("AWS EC2 instance starting error details", async () => {
          core.info(JSON.stringify(error));
        });
        retryCount++;
        if (retryCount >= maxRetries) {
          throw error;
        }
        core.warning(`Retrying... (Attempt ${retryCount}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30-second pause
      }
    }
  }

  async terminateEc2Instance(): Promise<void> {
    const client = new EC2Client();

    const params = {
      InstanceIds: [this.config.ec2InstanceId],
    };

    const command = new TerminateInstancesCommand(params);

    try {
      await client.send(command);
      core.info(`AWS EC2 instance ${this.config.ec2InstanceId} has terminated`);
    } catch (error) {
      core.error(`AWS EC2 instance ${this.config.ec2InstanceId} termination error`);
      throw error;
    }
  }

  async waitForInstanceRunning(ec2InstanceId: string): Promise<void> {
    const client = new EC2Client();

    const params = {
      InstanceIds: [ec2InstanceId],
    };

    try {
      await waitUntilInstanceRunning({ client, maxWaitTime: 30, minDelay: 3 }, params);
      core.info(`AWS EC2 instance ${ec2InstanceId} is up and running`);
    } catch (error) {
      core.error(`AWS EC2 instance ${ec2InstanceId} initialization error`);
      throw error;
    }
  }
}
