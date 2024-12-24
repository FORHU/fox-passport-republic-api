import { ObjectId } from "mongodb"

export const parseQuestion = (questions: any, id: ObjectId, identifier: string) => {
    const data = questions.map((item: any) => {
        const questionId = item._id ? new ObjectId(item._id) : new ObjectId();
        return {
          _id: questionId,
          question: item.question,
          answer: item.answer,
          type: item.type,
          options: item.options,
          max_capacity: item.max_capacity,
          key: item.key,
          reference: item.reference,
          ...identifier === "SPACE" && {space_id: id},
          ...identifier === "VENUE" && {venue_id: id},
        };
      });
      return data;
}