{
  description = "Raser - a modern desktop audio player (Electron)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils, ... }:
    let
      mkRaser = pkgs:
        pkgs.buildNpmPackage rec {
          pname = "raser";
          version = "1.0.0";
          src = self;

          npmDepsHash = "sha256-1LNdcdNT9OkR8KDI8sYPr7ud1JmpvMfMjyS/z42BG9Y=";

          ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
          forceGitDeps = true;
          npmInstallFlags = [ "--omit=dev" ];

          buildPhase = "true";

          installPhase =
            let
              appDir = "$out/share/raser";
              runtimeDeps = pkgs.lib.makeBinPath [ pkgs.yt-dlp pkgs.ffmpeg ];
              desktop = pkgs.makeDesktopItem {
                name = "Raser";
                desktopName = "Raser";
                genericName = "Audio Player";
                exec = "raser";
                icon = "raser";
                categories = [ "AudioVideo" "Audio" "Player" ];
                startupWMClass = "Raser";
              };
            in
            ''
              runHook preInstall

              mkdir -p ${appDir}
              for f in *; do cp -r "$f" ${appDir}/; done

              mkdir -p $out/bin
              makeWrapper ${pkgs.electron}/bin/electron $out/bin/raser \
                --add-flags ${appDir} \
                --prefix PATH : ${runtimeDeps}

              mkdir -p $out/share/applications
              cp ${desktop}/share/applications/*.desktop $out/share/applications/

              mkdir -p $out/share/icons/hicolor/256x256/apps
              cp ${appDir}/assets/icon.png $out/share/icons/hicolor/256x256/apps/raser.png

              runHook postInstall
            '';

          meta = with pkgs.lib; {
            description = "Raser - modern desktop music player";
            homepage = "https://github.com/darkness-38/Raser";
            license = licenses.mit;
            mainProgram = "raser";
            platforms = platforms.linux ++ platforms.darwin;
          };
        };
    in
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        packages = {
          default = mkRaser pkgs;
          raser = mkRaser pkgs;
          riff = mkRaser pkgs;
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs
            python3
            yt-dlp
            ffmpeg
          ];

          shellHook = ''
            echo "Raser dev shell. Install deps and run with:"
            echo "  npm install && npm start"
          '';
        };
      })
    // {
      overlays.default = final: prev: {
        raser = mkRaser final;
        riff = mkRaser final;
      };
    };
}
