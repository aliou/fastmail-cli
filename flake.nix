{
  description = "fastmail-cli - CLI for FastMail via JMAP";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    git-hooks = {
      url = "github:cachix/git-hooks.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, git-hooks }:
    let
      version = "0.2.1";

      # Binary hashes for releases - update these after each release
      # Run: nix-prefetch-url --type sha256 <url>
      # Then: nix hash to-sri --type sha256 <hash>
      binaries = {
        "aarch64-darwin" = {
          url = "https://github.com/aliou/fastmail-cli/releases/download/v${version}/fastmail-darwin-arm64";
          hash = "sha256-GJl+xdbxyN8KJ6V3DVMYuxkuNlxJ9f+FzZyrjVCSFus="; # darwin
        };
        "aarch64-linux" = {
          url = "https://github.com/aliou/fastmail-cli/releases/download/v${version}/fastmail-linux-arm64";
          hash = "sha256-kpfeEjx2yBClAXIF2N0/VPAd2nQWDn7FJ03T33XMuCs="; # linux-arm64
        };
        "x86_64-linux" = {
          url = "https://github.com/aliou/fastmail-cli/releases/download/v${version}/fastmail-linux-x64";
          hash = "sha256-JkQe4Fml2qAGibXk1OdCzRM/6htg/7qWSvEsz8ilBcc="; # linux-x64
        };
      };

      # Build from source for development
      buildFromSource = pkgs: pkgs.stdenv.mkDerivation {
        pname = "fastmail-cli";
        inherit version;

        src = ./.;

        nativeBuildInputs = [ pkgs.bun pkgs.makeWrapper ];

        buildPhase = ''
          export HOME=$(mktemp -d)
          bun install --frozen-lockfile
        '';

        installPhase = ''
          mkdir -p $out/lib/fastmail-cli
          cp -r node_modules $out/lib/fastmail-cli/
          cp -r src $out/lib/fastmail-cli/
          cp package.json $out/lib/fastmail-cli/

          mkdir -p $out/bin
          cat > $out/bin/fastmail << 'EOF'
          #!/usr/bin/env bash
          exec ${pkgs.bun}/bin/bun run "$out/lib/fastmail-cli/src/index.ts" "$@"
          EOF
          chmod +x $out/bin/fastmail

          substituteInPlace $out/bin/fastmail --replace '$out' "$out"
        '';

        meta = with pkgs.lib; {
          description = "CLI for FastMail via JMAP";
          homepage = "https://github.com/aliou/fastmail-cli";
          license = licenses.mit;
          platforms = platforms.all;
          mainProgram = "fastmail";
        };
      };

      # Fetch prebuilt binary from release
      fetchBinary = pkgs: system:
        let
          binary = binaries.${system} or (throw "Unsupported system: ${system}");
        in
        pkgs.stdenv.mkDerivation {
          pname = "fastmail-cli";
          inherit version;

          src = pkgs.fetchurl {
            url = binary.url;
            hash = binary.hash;
          };

          dontUnpack = true;

          installPhase = ''
            mkdir -p $out/bin
            cp $src $out/bin/fastmail
            chmod +x $out/bin/fastmail
          '';

          meta = with pkgs.lib; {
            description = "CLI for FastMail via JMAP";
            homepage = "https://github.com/aliou/fastmail-cli";
            license = licenses.mit;
            platforms = [ "aarch64-darwin" "aarch64-linux" "x86_64-linux" ];
            mainProgram = "fastmail";
          };
        };
    in
    flake-utils.lib.eachSystem [ "aarch64-darwin" "aarch64-linux" "x86_64-linux" ] (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        fastmail-cli = buildFromSource pkgs;

        pre-commit-check = git-hooks.lib.${system}.run {
          src = ./.;
          hooks = {
            biome-format = {
              enable = true;
              name = "biome format";
              entry = "${pkgs.bun}/bin/bun run format";
              files = "\\.(ts|json)$";
              pass_filenames = false;
            };
            typecheck = {
              enable = true;
              name = "typecheck";
              entry = "${pkgs.bun}/bin/bun run typecheck";
              files = "\\.ts$";
              pass_filenames = false;
            };
          };
        };
      in
      {
        checks = {
          pre-commit-check = pre-commit-check;
        };

        packages = {
          default = fastmail-cli;
          fastmail-cli = fastmail-cli;
          fastmail-cli-binary = fetchBinary pkgs system;
        };

        apps.default = {
          type = "app";
          program = "${fastmail-cli}/bin/fastmail";
        };

        devShells.default = pkgs.mkShell {
          inherit (pre-commit-check) shellHook;
          buildInputs = [ pkgs.bun ];
        };
      }
    );
}
