export const registryQueryOutput = String.raw`HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\GOG.com\Games\1207658691
    gameID    REG_SZ    1207658691
    gameName    REG_SZ    The Witcher 3: Wild Hunt
    path    REG_SZ    C:\Games\The Witcher 3
    exe    REG_SZ    witcher3.exe

HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\GOG.com\Games\1207658692
    gameID    REG_SZ    1207658692
    gameName    REG_SZ    Cyberpunk 2077
    path    REG_SZ    D:\Games\Cyberpunk 2077
    launchCommand    REG_SZ    "D:\Games\Cyberpunk 2077\bin\x64\Cyberpunk2077.exe" --launcher

HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\GOG.com\Games\9999999999
    gameID    REG_SZ    9999999999
    gameName    REG_SZ    Registry Only
    path    REG_SZ    E:\Games\RegistryOnly
    exe    REG_SZ
`;

export const witcherGameInfo = JSON.stringify({
  gameId: "1207658691",
  rootGameId: "1207658691",
  name: "The Witcher 3: Wild Hunt",
  version: "1.32",
  playTasks: [
    {
      category: "game",
      type: "FileTask",
      path: "bin\\x64\\witcher3.exe",
      isPrimary: true,
      workingDir: "",
    },
    {
      category: "launcher",
      type: "FileTask",
      path: "launcher.exe",
      isPrimary: false,
    },
  ],
});

export const cyberpunkGameInfo = JSON.stringify({
  gameId: "1207658692",
  name: "Cyberpunk 2077",
  playTasks: [
    {
      category: "game",
      path: "bin\\x64\\Cyberpunk2077.exe",
      isPrimary: true,
    },
  ],
});

export const galaxyDbRows = [
  {
    product_id: "1207658692",
    title: "Cyberpunk 2077",
    install_path: "D:\\Games\\Cyberpunk 2077",
  },
  {
    productId: "1207658691",
    gameTitle: "The Witcher 3",
    installPath: "C:\\Games\\The Witcher 3",
    executablePath: "bin\\x64\\witcher3.exe",
  },
  {
    product_id: "",
    title: "broken row",
  },
];
