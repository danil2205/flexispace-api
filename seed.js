const workspaces = [
  {
    title: "Уютная переговорка 'Альфа'",
    description: 'Светлая комната с проектором...',
    pricePerHour: 1500,
    capacity: 6,
    type: 'meeting_room',
    imageUrl:
      'http://localhost:9000/flexispace-images/workspaces/12e3c024-49c8-4a67-80b1-bffb0a7557c1-cat.jpg',
  },
  {
    title: 'Большой конференц-зал',
    description: 'Идеально для презентаций на 20 человек',
    pricePerHour: 5000,
    capacity: 20,
    type: 'meeting_room',
    imageUrl:
      'http://localhost:9000/flexispace-images/workspaces/12e3c024-49c8-4a67-80b1-bffb0a7557c1-cat.jpg',
  },
  {
    title: 'Малая переговорка (Зум-рум)',
    description: 'Тихая комната со звукоизоляцией для онлайн-созвонов',
    pricePerHour: 800,
    capacity: 2,
    type: 'meeting_room',
    imageUrl:
      'http://localhost:9000/flexispace-images/workspaces/12e3c024-49c8-4a67-80b1-bffb0a7557c1-cat.jpg',
  },
  {
    title: "Переговорка 'Лофт'",
    description: 'Стильная кирпичная комната с плазмой',
    pricePerHour: 2000,
    capacity: 8,
    type: 'meeting_room',
    imageUrl:
      'http://localhost:9000/flexispace-images/workspaces/12e3c024-49c8-4a67-80b1-bffb0a7557c1-cat.jpg',
  },
  {
    title: 'Рабочее место у окна',
    description: 'Фиксированный стол в опен-спейсе с отличным видом',
    pricePerHour: 500,
    capacity: 1,
    type: 'open_space',
    imageUrl:
      'http://localhost:9000/flexispace-images/workspaces/12e3c024-49c8-4a67-80b1-bffb0a7557c1-cat.jpg',
  },
  {
    title: 'Горячий стол (Hot Desk)',
    description: 'Любое свободное место в общей зоне',
    pricePerHour: 300,
    capacity: 1,
    type: 'open_space',
    imageUrl:
      'http://localhost:9000/flexispace-images/workspaces/12e3c024-49c8-4a67-80b1-bffb0a7557c1-cat.jpg',
  },
  {
    title: 'Тихая зона (Silent Space)',
    description: 'Место в зоне, где запрещено разговаривать по телефону',
    pricePerHour: 400,
    capacity: 1,
    type: 'open_space',
    imageUrl:
      'http://localhost:9000/flexispace-images/workspaces/12e3c024-49c8-4a67-80b1-bffb0a7557c1-cat.jpg',
  },
  {
    title: 'Стол для пары',
    description: 'Сдвоенный стол для совместной работы в опен-спейсе',
    pricePerHour: 900,
    capacity: 2,
    type: 'open_space',
    imageUrl:
      'http://localhost:9000/flexispace-images/workspaces/12e3c024-49c8-4a67-80b1-bffb0a7557c1-cat.jpg',
  },
  {
    title: "Опен-спейс 'Команда'",
    description: 'Островок из 4 столов для небольшой команды',
    pricePerHour: 1800,
    capacity: 4,
    type: 'open_space',
    imageUrl:
      'http://localhost:9000/flexispace-images/workspaces/12e3c024-49c8-4a67-80b1-bffb0a7557c1-cat.jpg',
  },
  {
    title: "Офис 'Стартап'",
    description: 'Закрытый стеклянный кабинет для небольшой команды',
    pricePerHour: 2500,
    capacity: 5,
    type: 'private_office',
    imageUrl:
      'http://localhost:9000/flexispace-images/workspaces/12e3c024-49c8-4a67-80b1-bffb0a7557c1-cat.jpg',
  },
  {
    title: 'Личный кабинет руководителя',
    description: 'Просторный кабинет с диваном и сейфом',
    pricePerHour: 3500,
    capacity: 1,
    type: 'private_office',
    imageUrl:
      'http://localhost:9000/flexispace-images/workspaces/12e3c024-49c8-4a67-80b1-bffb0a7557c1-cat.jpg',
  },
  {
    title: 'Кабинет для двоих',
    description: 'Небольшой, но уютный закрытый офис',
    pricePerHour: 1500,
    capacity: 2,
    type: 'private_office',
    imageUrl:
      'http://localhost:9000/flexispace-images/workspaces/12e3c024-49c8-4a67-80b1-bffb0a7557c1-cat.jpg',
  },
  {
    title: "Офис 'Айтишник'",
    description: 'Кабинет без окон, с мощной вентиляцией и сервером',
    pricePerHour: 3000,
    capacity: 4,
    type: 'private_office',
    imageUrl:
      'http://localhost:9000/flexispace-images/workspaces/12e3c024-49c8-4a67-80b1-bffb0a7557c1-cat.jpg',
  },
  {
    title: "Офис 'Премиум'",
    description: 'Большой кабинет на 10 человек с личной кофемашиной',
    pricePerHour: 8000,
    capacity: 10,
    type: 'private_office',
    imageUrl:
      'http://localhost:9000/flexispace-images/workspaces/12e3c024-49c8-4a67-80b1-bffb0a7557c1-cat.jpg',
  },
  {
    title: 'Офис с террасой',
    description: 'Кабинет с выходом на крышу',
    pricePerHour: 6000,
    capacity: 6,
    type: 'private_office',
    imageUrl:
      'http://localhost:9000/flexispace-images/workspaces/12e3c024-49c8-4a67-80b1-bffb0a7557c1-cat.jpg',
  },
];

const ADMIN_TOKEN = '';

const seedDatabase = async () => {
  for (const item of workspaces) {
    try {
      await fetch('http://localhost:3000/workspaces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ADMIN_TOKEN}`,
        },
        body: JSON.stringify(item),
      });
    } catch (err) {
      console.error(err);
    }
  }
};

seedDatabase();
