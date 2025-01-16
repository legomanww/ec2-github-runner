# On-demand GitHub Actions self-hosted runner on AWS EC2

originally forked from [Dmitry1987/ec2-github-runner](https://github.com/Dmitry1987/ec2-github-runner), which was a fork of [machulav/ec2-github-runner](https://github.com/machulav/ec2-github-runner), and then modified.
> [!WARNING]
>
> Note the security implications as mentioned in [machulav/ec2-github-runner](https://github.com/machulav/ec2-github-runner?tab=readme-ov-file#self-hosted-runner-security-with-public-repositories)
>
> We recommend that you do not use self-hosted runners with public repositories.
>
> Forks of your public repository can potentially run dangerous code on your self-hosted runner machine by creating a pull request that executes the code in a workflow.
>
> Please find more details about this security note on [GitHub documentation](https://docs.github.com/en/free-pro-team@latest/actions/hosting-your-own-runners/about-self-hosted-runners#self-hosted-runner-security-with-public-repositories).

---

Start an EC2 [self-hosted runner](https://docs.github.com/en/free-pro-team@latest/actions/hosting-your-own-runners), run the job on it, and stop it when finished.

![GitHub Actions self-hosted EC2 runner](docs/images/github-actions-summary.png)

See [below](#example) the YAML code of the depicted workflow.

**Table of Contents**

- [Usage](#usage)
  - [How to start](#how-to-start)
  - [Inputs](#inputs)
    - [Start](#start)
    - [Stop](#stop)
  - [Environment variables](#environment-variables)
  - [Outputs](#outputs)
  - [Example](#example)
- [License Summary](#license-summary)


## Usage

### How to start

Use the following steps to prepare your workflow for running on your EC2 self-hosted runner:

**1. Prepare IAM user with AWS access keys**

1. Create new AWS access keys for the new or an existing IAM user with the following least-privilege minimum required permissions:

   ```
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "ec2:RunInstances",
           "ec2:TerminateInstances",
           "ec2:DescribeInstances",
           "ec2:DescribeInstanceStatus"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

   If you plan to attach an IAM role to the EC2 runner with the `iam-role-name` parameter, you will need to allow additional permissions:

   ```
   {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "ec2:ReplaceIamInstanceProfileAssociation",
          "ec2:AssociateIamInstanceProfile"
        ],
        "Resource": "*"
      },
      {
        "Effect": "Allow",
        "Action": "iam:PassRole",
        "Resource": "*"
      }
    ]
   }
   ```

   If you use the `aws-resource-tags` parameter, you will also need to allow the permissions to create tags:

   ```
   {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "ec2:CreateTags"
        ],
        "Resource": "*",
        "Condition": {
          "StringEquals": {
            "ec2:CreateAction": "RunInstances"
          }
        }
      }
    ]
   }
   ```

   These example policies above are provided as a guide. They can and most likely should be limited even more by specifying the resources you use.

2. Add the keys to GitHub secrets.
3. Use the [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials) action to set up the keys as environment variables.

**2. Prepare GitHub personal access token**

1. Create a new GitHub personal access token with the `repo` scope.
   The action will use the token for self-hosted runners management in the GitHub account on the repository level.
2. Add the token to GitHub secrets.

**3. Prepare EC2 image**

1. Create a new EC2 instance based on any Linux distribution you need.
2. Connect to the instance using SSH, install `docker` and `git`, then enable `docker` service.

   For Amazon Linux 2, it looks like the following:

   ```.shell
    sudo yum update -y && \
    sudo yum install docker -y && \
    sudo yum install git -y && \
    sudo yum install libicu -y && \
    sudo systemctl enable docker
   ```

   For other Linux distributions, it could be slightly different.

   For a Windows server instance, it looks like the following:

   Note: This must be done over RDP since `choco install git` doesn't seem to install correctly over a session manager
   connection

   ```.ps1
   Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
   choco install git
   
   # Remove existing user data run once file (this is so that the user-data being set on instance start actually runs).
   rm C:\ProgramData\Amazon\EC2Launch\state\.run-once
   ```
   Note: The `.run-once` file needs to be deleted with every start of the instance you are snapshotting.
   If you stop and reboot the instance a few times please make sure you delete the `.run-once` file before creating the 
   AMI.

3. Install any other tools required for your workflow.
4. Create a new EC2 image (AMI) from the instance.
5. Remove the instance if not required anymore after the image is created.

Alternatively, you can use a vanilla EC2 AMI and set up the dependencies via `pre-runner-script` in the workflow YAML file. See example in the `pre-runner-script` documentation below.

**4. Prepare VPC with subnet and security group**

1. Create a new VPC and a new subnet in it.
   Or use the existing VPC and subnet.
2. Create a new security group for the runners in the VPC.
   Only the outbound traffic on port 443 should be allowed for pulling jobs from GitHub.
   No inbound traffic is required.

**5. Configure the GitHub workflow**

1. Create a new GitHub Actions workflow or edit the existing one.
2. Use the documentation and example below to configure your workflow.
3. Please don't forget to set up a job for removing the EC2 instance at the end of the workflow execution.
   Otherwise, the EC2 instance won't be removed and continue to run even after the workflow execution is finished.

Now you're ready to go!

### Inputs

#### Start


| Name | Required | Description |
|-|-|-|
| `github-token` | ✅ | GitHub Personal Access Token with the `repo` scope assigned. |
| `runner-version` | - | Version of the Github Actions Runner software to use. Defaults to `latest`, use `none` to skip install if it already installed as part of the AMI. |
| `registration-timeout` | - | Timeout in minutes while waiting for the runner to register with Github. Defaults to 5 minutes. |
| `ec2-image-id` | ✅ | EC2 Image Id (AMI). <br><br> The new runner will be launched from this image. |
| `ec2-instance-type` | ✅ | EC2 Instance Type. |
| `ec2-os` | - | Base OS type of the EC2 image (AMI). This defaults to Linux.  The new runner needs to be configured based on OS: <br> - `windows` <br> - `linux`  |
| `max-retries` | - | Maximum number of attempts to start the instance. Defaults to 1. |
| `subnet-id` | ✅ | VPC Subnet Id. <br><br> The subnet should belong to the same VPC as the specified security group. |
| `security-group-id` | ✅ | EC2 Security Group Id. <br><br> The security group should belong to the same VPC as the specified subnet. <br><br> Only the outbound traffic for port 443 should be allowed. No inbound traffic is required. |
| `iam-role-name`  | - | IAM role name to attach to the created EC2 runner. <br><br> This allows the runner to have permissions to run additional actions within the AWS account, without having to manage additional GitHub secrets and AWS users. <br><br> Setting this requires additional AWS permissions for the role launching the instance (see above). |
| `aws-resource-tags` | - | Specifies tags to add to the EC2 instance and any attached storage. <br><br> This field is a stringified JSON array of tag objects, each containing a `Key` and `Value` field (see example below). <br><br> Setting this requires additional AWS permissions for the role launching the instance (see above). |
| `runner-home-dir` | - | Specifies a directory where pre-installed actions-runner software and scripts are located. |
| `aws-key-pair-name`  | - | Specifies a key pair to add to the instance when launching it |
| `volume-size` | - | Specifies the size of the volume in GiB. |
| `volume-type` | - | Specifies the type of volume to create. Allowed values: <br> - `standard` <br> - `io1` <br> - `io2` <br> - `gp2` <br> - `gp3` <br> - `sc1` <br> - `st1`  |
| `volume-throughput` | - | Specifies the throughput the volume will support, in MiB/s. Only valid for `gp3` volumes. |
| `volume-iops` | - | Specifies the IOPS for the volume. Required for `io1` and `io2` volumes |
| `volume-device-name` | - | EC2 Block Storage Volume Device Name.<br>For example, /dev/sdh or xvdh.<br>Used for configuring the mount path of the volume if you're overriding the default volume size of the EC2 instance.<br>The parameter `volume-size` must also be configured when using this parameter.<br>This parameter must be configured when using the `volume-size` parameter. |
| `associate-public-ip` | - | Specifies whether to assign a public IPv4 address to an Instance. Allowed values: `true` or `false`. Default value is `true` |
| `spot` | - | Specifies if a spot instance should be used. Allowed values: `true` or `false`. The default is to use an on-demand instance (`false`). |
| `pre-runner-script` | - | Specifies bash commands to run before the runner starts.  It's useful for installing dependencies with apt-get, yum, dnf, etc. For example:<pre>          - name: Start EC2 runner<br>            with:<br>              ...<br>              pre-runner-script: \|<br>                 sudo yum update -y && \ <br>                 sudo yum install docker git libicu -y<br>                 sudo systemctl enable docker</pre> |

#### Stop

| Name | Required | Description |
|-|-|-|
| `github-token` | ✅ | GitHub Personal Access Token with the 'repo' scope assigned. |
| `label` | ✅ | Name of the unique label assigned to the runner. | 
| `ec2-instance-id` | ✅ | EC2 Instance Id of the created runner. |

### Environment variables

In addition to the inputs described above, the action also requires the following environment variables to access your AWS account:

- `AWS_DEFAULT_REGION`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

We recommend using [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials) action right before running the step for creating a self-hosted runner. This action perfectly does the job of setting the required environment variables.

### Outputs

| Name | Description |
| - | - |
| `label` | Name of the unique label assigned to the runner. <br><br> The label is used in two cases: <br> - to use as the input of `runs-on` property for the following jobs; <br> - to remove the runner from GitHub when it is not needed anymore. |
| `ec2-instance-id` | EC2 Instance Id of the created runner. <br><br> The id is used to terminate the EC2 instance when the runner is not needed anymore. |

### Example

The workflow showed in the picture above and declared in `do-the-job.yml` looks like this:

```yml
name: example
on: pull_request

jobs:
  start-runner:
    name: Start self-hosted EC2 runner
    runs-on: ubuntu-latest
    outputs:
      label: ${{ steps.start-runner.outputs.label }}
      ec2-instance-id: ${{ steps.start-runner.outputs.ec2-instance-id }}
    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v1
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Start EC2 runner
        id: start-ec2-runner
        uses: legomanww/ec2-github-runner/start@v2
        with:
          github-token: ${{ secrets.GH_PERSONAL_ACCESS_TOKEN }}
          ec2-image-id: ami-123
          ec2-instance-type: t3.nano
          ec2-os: linux
          subnet-id: subnet-123
          security-group-id: sg-123
          spot: true
          volume-size: 50
          volume-type: gp3
          volume-iops: 3000
          volume-device-name: /dev/xvda
          iam-role-name: my-role-name # optional, requires additional permissions
          pre-runner-script: | # example
            sudo yum update -y
            sudo yum install -y docker git libicu 
            sudo systemctl enable docker
            sudo systemctl start docker
            sudo usermod -a -G docker ec2-user
          aws-resource-tags: > # optional, requires additional permissions
            [
              {"Key": "Name", "Value": "ec2-github-runner"},
              {"Key": "GitHubRepository", "Value": "${{ github.repository }}"}
            ]

  do-the-job:
    name: Do the job on the runner
    needs: start-runner # required to start the main job when the runner is ready
    runs-on: ${{ needs.start-runner.outputs.label }} # run the job on the newly created runner
    steps:
      - name: Hello World
        run: echo 'Hello World!'

  stop-runner:
    name: Stop self-hosted EC2 runner
    needs:
      - start-runner # required to get output from the start-runner job
      - do-the-job # required to wait when the main job is done
    runs-on: ubuntu-latest
    if: ${{ always() }} # required to stop the runner even if the error happened in the previous jobs
    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v1
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Stop EC2 runner
        uses: legomanww/ec2-github-runner/stop@v2
        with:
          github-token: ${{ secrets.GH_PERSONAL_ACCESS_TOKEN }}
          label: ${{ needs.start-runner.outputs.label }}
          ec2-instance-id: ${{ needs.start-runner.outputs.ec2-instance-id }}
```

## License Summary

This code is made available under the [MIT license](LICENSE).
