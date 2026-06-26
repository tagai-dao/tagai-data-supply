"""一键化 CLI：configure / login / run。spec §11。"""
import click


@click.group()
def cli():
    """tagai-data-supply 节点 CLI。"""


@cli.command()
def configure():
    """配置 relayer 地址（注册前用，或 invite 换 token）。"""
    click.echo("configure: TODO (P1/P7)")


@cli.command()
def login():
    """交互式输入 cookie（ct0 / auth_token），存本地。"""
    click.echo("login: TODO (P2)")


@cli.command()
def run():
    """常驻运行：注册 → WS 连接 → 领任务 → 抓取 → 回传。"""
    click.echo("run: TODO (P1)")


def main():
    cli()


if __name__ == "__main__":
    main()
